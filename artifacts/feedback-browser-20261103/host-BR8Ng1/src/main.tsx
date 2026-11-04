import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";
const report=(message)=>fetch('/__feedback-check/error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});
window.addEventListener('error',event=>report(event.message));window.addEventListener('unhandledrejection',event=>report(String(event.reason)));
createRoot(document.getElementById('root')).render(<Agent endpoint="http://127.0.0.1:5191/agent" feedback={{url:"http://127.0.0.1:5191/feedback"}} onError={error=>report(error.message)}/>);