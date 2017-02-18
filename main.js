#!/usr/bin/env node

// start side-causes, read from the world
const fs = require('fs');
const program = require('commander');
const http = require('http');
const execSync = require('child_process').execSync;
const nodeCleanup = require('node-cleanup');
const Builder = require('systemjs-builder');
const chokidar = require('chokidar');

program
    .version('0.0.0')
    .option('-p, --port [port]', 'Specify the server\'s port')
    .option('-l, --logs', 'Turn on logging to files in current directory')
    .option('-r, --spa-root [spaRoot]', 'The file to redirect to when a requested file is not found')
    .parse(process.argv);
// end side-causes

// start pure operations, generate the data
const spaRoot = program.spaRoot || 'index.html';
const logs = program.logs;
const accessLogFile = logs ? 'http.access.log' : '/dev/null';
const errorLogFile = logs ? 'http.error.log' : '/dev/null';
const nginxPort = +(program.port || 5000);
const typeScriptPort = nginxPort + 1;
const nginxConf = createNGINXConfigFile(fs, nginxPort, typeScriptPort, spaRoot);
const typeScriptBuilder = createTypeScriptBuilder(Builder);
const typeScriptHttpServer = createTypeScriptServer(http, typeScriptPort, typeScriptBuilder);
const io = require('socket.io')(typeScriptHttpServer);
const watcher = configureFileWatcher(io);
//end pure operations

// start side-effects, change the world
fs.writeFileSync('nginx.conf', nginxConf);
execSync(`sudo nginx -p . -c nginx.conf && exit 0`);
console.log(`NGINX listening on port ${nginxPort}`);
nodeCleanup((exitCode, signal) => {
    execSync(`sudo nginx -p . -s stop`);
});
typeScriptHttpServer.listen(typeScriptPort);
// end side-effects

function createNGINXConfigFile(fs, nginxPort, typeScriptPort, spaRoot) {
    return `
        events {}

        http {

            server {
                listen ${nginxPort};

                access_log ${accessLogFile};
                error_log ${errorLogFile};

                root .;

                # send all .ts files to the Node.js server for transpilation
                location ~ \..ts$ {
                    proxy_pass http://localhost:${typeScriptPort};
                }

                # send all requests to files that don't exist back to the root file
                location / {
                    try_files $uri /${spaRoot};
                    # try_files $uri $uri/ /${spaRoot}; # If the above ends up not working, this line also seemed popular
                }
            }
        }
    `;
}

function configureFileWatcher(io) {
    return chokidar.watch('.').on('change', (path) => {
        reloadBrowser(io);
    });
}

function reloadBrowser(io) {
    io.emit('reload');
}

function createTypeScriptServer(http, typeScriptPort, builder) {
    return http.createServer((req, res) => {
        const path = req.url.slice(1);
        const isRootImport = !isSystemImportRequest(req);

        builder.compile(path, null, {
            minify: false
        }).then((output) => {
            const source = prepareSource(isRootImport, path, output.source);
            res.end(source);
        }, (error) => {
            console.log(error);
        });
    });
}

function createTypeScriptBuilder(Builder) {
    const builder = new Builder();

    //TODO redo this config, get rid of everything that is unnecessary, becuase I believe there might be quite a bit of it
    builder.config({
        transpiler: 'ts',
        typescriptOptions: {
            target: 'es5',
            module: 'system'
        },
        meta: {
            '*.ts': {
                loader: 'ts'
            }
        },
        packages: {
            '/': {
                defaultExtension: 'ts'
            },
            ts: {
                main: 'plugin.js'
            },
            typescript: {
                main: 'typescript.js',
                meta: {
                    'typescript.js': {
                        exports: 'ts'
                    }
                }
            }
        },
        map: {
            ts: './node_modules/plugin-typescript/lib/',
            typescript: './node_modules/typescript/lib/'
        }
    });

    return builder;
}

function isSystemImportRequest(req) {
    return req.headers.accept && req.headers.accept.includes('application/x-es-module');
}

function prepareSource(isRootImport, path, rawSource) {
    if (isRootImport) {
        const escapedSource = rawSource.replace(/\\/g, '\\\\');
        const preparedSource = `
            System.define(System.normalizeSync('${path}'), \`
                ${escapedSource}
            \`);
        `;
        return preparedSource;
    }
    else {
        return rawSource;
    }
}
