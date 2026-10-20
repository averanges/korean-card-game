import {createRoomsServer} from './server';
const port=Number(process.env.PORT||10000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const app=createRoomsServer();app.server.listen(port,'0.0.0.0',()=>console.log(`Hangul Durak rooms listening on port ${port}; storage=memory (lost on restart)`));
let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{if(stopping)return;stopping=true;void app.close().then(()=>process.exit(0));});
