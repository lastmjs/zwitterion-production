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
    .version('0.0.2')
    .option('-p, --port [port]', 'Specify the server\'s port')
    .option('-l, --logs', 'Turn on logging to files in current directory')
    .option('-r, --spa-root [spaRoot]', 'The file to redirect to when a requested file is not found')
    .option('-w, --watch-files', 'Watch files in current directory and reload browser on changes')
    .parse(process.argv);
// end side-causes

// start pure operations, generate the data
const watchFiles = program.watchFiles;
const spaRoot = program.spaRoot || 'index.html';
const logs = program.logs;
const accessLogFile = logs ? 'http.access.log' : '/dev/null';
const errorLogFile = logs ? 'http.error.log' : '/dev/null';
const nginxPort = +(program.port || 5000);
const typeScriptPort = nginxPort + 1;
const nginxConf = createNGINXConfigFile(fs, nginxPort, typeScriptPort, spaRoot);
let typeScriptBuilder = createTypeScriptBuilder(Builder);
const typeScriptHttpServer = createTypeScriptServer(http, typeScriptPort, typeScriptBuilder, watchFiles);
const io = require('socket.io')(typeScriptHttpServer);
if (watchFiles) configureFileWatcher(io, typeScriptBuilder);
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

                location /zwitterion-config.js {
                    proxy_pass http://localhost:${typeScriptPort};
                }

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

function configureFileWatcher(io, typeScriptBuilder) {
    return chokidar.watch('.').on('change', (path) => {
        // typeScriptBuilder.invalidate(path); //TODO not sure if we need this yet
        reloadBrowser(io);
    });
}

function reloadBrowser(io) {
    io.emit('reload');
}

function createTypeScriptServer(http, typeScriptPort, builder, watchFiles) {
    return http.createServer((req, res) => {
        const path = req.url.slice(1);

        if (path === 'zwitterion-config.js') {
            const systemJS = fs.readFileSync('node_modules/systemjs/dist/system.js', 'utf8'); //TODO we might not want to leave this as sync, but I don't think it matters for development, and this will only be used for development
            const socketIO = watchFiles ? fs.readFileSync('node_modules/socket.io-client/dist/socket.io.min.js', 'utf8') : '';
            const tsImportsConfig = `
                System.config({
                    packages: {
                        '': {
                            defaultExtension: 'ts'
                        }
                    }
                });
            `;
            const socketIOConfig = watchFiles ? `
                window.ZWITTERION_SOCKET = window.ZWITTERION_SOCKET || io('http://localhost:${typeScriptPort}');
                window.ZWITTERION_SOCKET.removeAllListeners('reload');
                window.ZWITTERION_SOCKET.on('reload', function() {
                    window.location.reload();
                });
            ` : '';

            res.end(`${systemJS}${socketIO}${tsImportsConfig}${socketIOConfig}`);
            return;
        }

        const isRootImport = !isSystemImportRequest(req);

        builder.compile(path, null, {
            minify: false
        })
        .then((output) => {
            const source = prepareSource(isRootImport, path, output.source);
            res.end(source);
        })
        .catch((error) => {
            res.end(error.toString());
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
