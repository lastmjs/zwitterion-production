# zwitterion-production

## Installation

```
sudo apt-get update
sudo apt-get install nginx
```

## Use

### Development Use

Start the server: `npm start`
Stop the server: `npm run stop`

### Production Use

Make sure the machine that you deploy to has NGINX installed.

#### Dokku

If you are using Dokku, do the following:

#### Custom

```
sudo apt-get update //make sure packages are up to date
sudo apt-get upgrade // not sure exactly what this does, look into it
sudo apt-get install nginx

//What does the -y option on the apt-get command do?
```

NGINX https config:
```
server {
  listen 443 ssl;
  server_name solutiamaxima.com www.solutiamaxima.com
}
```

How to get a Let's Encrypt certificate:

```
sudo apt-get install letsencrypt
sudo letsencrypt certonly --standalone -d solutiamaxima.com -d www.solutiamaxima.com
//now set up nginx to point to the certificate location...
```
