const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = {
  "server": {
    "baseDir": "./src",
    "index": "login.html",
    "routes": {
      "/node_modules": "node_modules",
      "/contracts": "./src/contracts"
    },
    middleware: {
      1: createProxyMiddleware({
        target: 'http://localhost:3000',
        changeOrigin: true,
        pathRewrite: {
          '^/api': '/api'
        }
      })
    }
  },
  "files": ["./src/**/*.{html,css,js}"],
  "port": 3000,
  "startPath": "/login.html"
}