/** Geometry shared by the approved preview and the real hand. No game rules. */
export function fanGeometry(count:number,width:number,height:number){
 const dense=count>6;
 const cardWidth=Math.max(32,Math.min(100,width-16-5*44,(height-28)/1.49)),cardHeight=cardWidth*1.49;
 const step=count>1?Math.min(Math.max(44,cardWidth*.66),(width-cardWidth-16)/(count-1)):0;
 const extent=cardWidth+step*Math.max(0,count-1),left=(width-extent)/2;
 return {cardWidth,cardHeight,step,dense,positions:Array.from({length:count},(_,i)=>{const t=count<=1?0:(i-(count-1)/2)/((count-1)/2);return {x:left+i*step,y:(height<110?10:19)+t*t*5,angle:t*3,hitWidth:i===count-1?Math.max(44,cardWidth):step};})};
}
