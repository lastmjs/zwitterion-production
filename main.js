const fs = require('fs');
const program = require('commander');

program
    .version('0.0.0')
    .option('-p, --port [port]', 'Specify the server\'s port')
    .parse(process.argv);

const port = program.port || 5000;

createNGINXConfigFile(port);

function createNGINXConfigFile(port) {
    fs.writeFileSync('nginx.conf', `
        events {}

        http {

            server {
                listen ${port};

                access_log http.access.log;
                error_log http.error.log;

                root .;
                location / {

                }
            }
        }
    `);
}
