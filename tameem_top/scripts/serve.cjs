// Local preview only. GitHub Pages serves the frontend after deployment.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'})[path.extname(file)]||'text/plain; charset=utf-8');
    res.setHeader('Cache-Control','no-store');res.end(data);
  });
});
server.listen(Number(process.env.PORT||4180),'127.0.0.1',()=>console.log('Open http://localhost:'+(process.env.PORT||4180)));
