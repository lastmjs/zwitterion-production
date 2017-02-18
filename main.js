// start side-causes, read from the world
const fs = require('fs');
const program = require('commander');
const http = require('http');
const execSync = require('child_process').execSync;
const nodeCleanup = require('node-cleanup');

program
    .version('0.0.0')
    .option('-p, --port [port]', 'Specify the server\'s port')
    .parse(process.argv);
// end side-causes

// start pure operations, generate the data
const nginxPort = +(program.port || 5000);
const nodePort = nginxPort + 1;
const nginxConf = createNGINXConfigFile(fs, nginxPort, nodePort);
const httpServer = createNodeServer(http, nodePort);
//end pure operations

// start side-effects, change the world
fs.writeFileSync('nginx.conf', nginxConf);
execSync(`sudo nginx -p . -c nginx.conf && exit 0`);
console.log(`NGINX listening on port ${nginxPort}`);
nodeCleanup((exitCode, signal) => {
    execSync(`sudo nginx -p . -s stop`);
});
httpServer.listen(nodePort + 1);
// end side-effects

function createNGINXConfigFile(fs, nginxPort, nodePort) {
    return `
        events {}

        http {

            server {
                listen ${nginxPort};

                access_log http.access.log;
                error_log http.error.log;

                location / {
                    proxy_pass http://localhost:${nodePort};
                }

                location /LICENSE {
                    proxy_pass http://localhost:${nodePort};
                }
            }
        }
    `;
}

function createNodeServer(http, nodePort) {
    return http.createServer((req, res) => {
        res.end('hello there sir');
    });
}
