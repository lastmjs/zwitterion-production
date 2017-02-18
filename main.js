// start side-causes, read from the world
const fs = require('fs');
const program = require('commander');
const http = require('http');
const execSync = require('child_process').execSync;
const nodeCleanup = require('node-cleanup');
const Builder = require('systemjs-builder');

program
    .version('0.0.0')
    .option('-p, --port [port]', 'Specify the server\'s port')
    .parse(process.argv);
// end side-causes

// start pure operations, generate the data
const nginxPort = +(program.port || 5000);
const nodePort = nginxPort + 1;
const nginxConf = createNGINXConfigFile(fs, nginxPort, nodePort);
const typeScriptBuilder = createTypeScriptBuilder(Builder);
const httpServer = createNodeServer(http, nodePort, typeScriptBuilder);
//end pure operations

// start side-effects, change the world
fs.writeFileSync('nginx.conf', nginxConf);
execSync(`sudo nginx -p . -c nginx.conf && exit 0`);
console.log(`NGINX listening on port ${nginxPort}`);
nodeCleanup((exitCode, signal) => {
    execSync(`sudo nginx -p . -s stop`);
});
httpServer.listen(nodePort);
// end side-effects

function createNGINXConfigFile(fs, nginxPort, nodePort) {
    return `
        events {}

        http {

            server {
                listen ${nginxPort};

                access_log http.access.log;
                error_log http.error.log;

                root .;

                location ~ \..ts$ {
                    proxy_pass http://localhost:${nodePort};
                }
            }
        }
    `;
}

function createNodeServer(http, nodePort, builder) {
    return http.createServer((req, res) => {
        const path = req.url.slice(1);

        builder.compile(path, null, {
            minify: false
        }).then((output) => {
            const source = prepareSource(path, output.source);
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

function prepareSource(path, rawSource) {
    const escapedSource = rawSource.replace(/\\/g, '\\\\');
    const preparedSource = `
        System.define(System.normalizeSync('${path}'), \`
            ${escapedSource}
        \`);
    `;
    return preparedSource;
}
