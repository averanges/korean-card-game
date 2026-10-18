import {useId} from 'react';

const paths=[
 'M120 68C101 93 66 117 64 146C61 179 96 194 114 173C112 190 106 205 94 216H146C134 205 128 190 126 173C145 194 181 179 177 146C174 117 139 93 120 68Z',
 'M120 213C101 194 58 160 63 120C67 87 102 81 120 105C138 81 173 87 177 120C182 160 139 194 120 213Z',
 'M120 65L183 142L120 220L57 142Z',
 'M103 127C78 108 89 73 119 73C151 73 163 107 138 127C165 109 196 131 189 158C184 186 148 194 128 172C129 189 135 204 146 215H94C105 204 111 189 112 172C90 195 56 184 51 158C45 130 76 109 103 127Z',
];
const palettes=[['#261249','#8d6de2','#38256c','#d2b3ff'],['#58132f','#ef8fac','#a33563','#ffe0e5'],['#773145','#ee9aaf','#b65680','#fff0d2'],['#101d3c','#4778a5','#183a59','#b7e2f1']];
const facets=['50,65 120,72 88,121','120,72 170,65 152,123','88,121 120,72 120,145','120,72 152,123 120,145','50,65 88,121 56,157','56,157 88,121 120,145','88,121 120,145 92,179','120,145 152,123 166,173','152,123 190,95 195,163','152,123 195,163 166,173','56,157 92,179 85,221','56,157 120,145 92,179','92,179 120,145 122,224','120,145 166,173 122,224','166,173 195,163 165,225','92,179 122,224 85,221','166,173 165,225 122,224'];

export function SuitJewel({suit}:{suit:number}){
 const id='jewel-'+useId().replace(/:/g,''),colors=palettes[suit];
 return <svg className={'suit-jewel jewel-'+suit} viewBox="0 0 240 280" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id={id+'-gold'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff1c5"/><stop offset=".28" stopColor="#aa7655"/><stop offset=".5" stopColor="#fff4da"/><stop offset=".76" stopColor="#b68869"/><stop offset="1" stopColor="#ffe2a6"/></linearGradient>
   <radialGradient id={id+'-aura'}><stop stopColor={colors[1]} stopOpacity=".58"/><stop offset=".55" stopColor="#8c68cf" stopOpacity=".2"/><stop offset="1" stopColor="#9a7bdf" stopOpacity="0"/></radialGradient>
   <linearGradient id={id+'-gem'} x2=".8" y2="1"><stop stopColor={colors[3]}/><stop offset=".4" stopColor={colors[1]}/><stop offset="1" stopColor={colors[0]}/></linearGradient>
   <clipPath id={id+'-clip'}><path d={paths[suit]}/></clipPath>
   <g id={id+'-leaf'}><path d="M0 0Q-14-5-9-23Q2-18 0 0Z" fill="#a690df" stroke="#e6d4ef" strokeWidth=".8"/><path d="M0 0-9-23-4-11Z" fill="#e5d6ff" opacity=".7"/></g>
  </defs>
  <ellipse className="jewel-aura" cx="120" cy="148" rx="119" ry="119" fill={'url(#'+id+'-aura)'}/>
  <g className="jewel-orbits" fill="none" stroke="#c4a4ec" strokeWidth=".65">
   <ellipse cx="120" cy="146" rx="107" ry="113"/><ellipse cx="120" cy="146" rx="102" ry="107" strokeOpacity=".5"/>
   <ellipse cx="120" cy="146" rx="120" ry="46" transform="rotate(-35 120 146)" strokeWidth="2" strokeOpacity=".45"/>
   <ellipse cx="120" cy="146" rx="120" ry="46" transform="rotate(35 120 146)" strokeWidth="1.6" strokeOpacity=".5"/>
   <ellipse cx="120" cy="146" rx="107" ry="113" stroke="#f7dfff" strokeWidth="2" strokeDasharray="1 23 2 37"/>
  </g>
  <g className="jewel-body">
   <path d={paths[suit]} fill={colors[0]} stroke="#251b37" strokeWidth="11" strokeLinejoin="round"/>
   <path d={paths[suit]} fill={'url(#'+id+'-gem)'} stroke={'url(#'+id+'-gold)'} strokeWidth="7" strokeLinejoin="round"/>
   <g clipPath={'url(#'+id+'-clip)'}>{facets.map((points,i)=><polygon key={points} points={points} fill={colors[i%4]} fillOpacity={i%3===0?'.85':'.57'} stroke={colors[3]} strokeOpacity=".14" strokeWidth=".55"/>)}</g>
   <path d={paths[suit]} fill="none" stroke={'url(#'+id+'-gold)'} strokeWidth="2"/>
   <path d="M120 65 114 51 120 34 127 51Z" fill="#a89ae6" stroke={'url(#'+id+'-gold)'} strokeWidth="1.5"/><path d="m120 36 1 25-6-10Z" fill="#f5e7ff"/>
   <path d="M120 61Q105 49 100 58Q109 60 120 69Q131 60 140 58Q135 49 120 61ZM120 217Q109 234 96 230Q104 243 120 233Q136 243 144 230Q131 234 120 217Z" fill="#302445" stroke={'url(#'+id+'-gold)'} strokeWidth="1.3"/>
   <path d="m120 228 8 15-8 14-8-14Z" fill="#8e7fd1" stroke={'url(#'+id+'-gold)'} strokeWidth="1.2"/>
  </g>
  <g fill="none" stroke={'url(#'+id+'-gold)'} strokeWidth="1.1"><path d="M36 188Q28 160 34 126M204 188Q212 160 206 126"/></g>
  <g><use href={'#'+id+'-leaf'} transform="translate(36 170) rotate(-36)"/><use href={'#'+id+'-leaf'} transform="translate(33 151) rotate(-24)"/><use href={'#'+id+'-leaf'} transform="translate(34 136) rotate(14)"/><use href={'#'+id+'-leaf'} transform="translate(204 170) scale(-1 1) rotate(-36)"/><use href={'#'+id+'-leaf'} transform="translate(207 151) scale(-1 1) rotate(-24)"/><use href={'#'+id+'-leaf'} transform="translate(206 136) scale(-1 1) rotate(14)"/></g>
  <g fill="#f8ddff">{[[120,17,7],[120,272,5],[46,57,4],[197,75,4],[18,143,3],[222,150,4],[68,234,3],[170,239,3]].map(([x,y,r])=><path key={x+','+y} d={`M${x} ${y-r}Q${x+1} ${y-1} ${x+r} ${y}Q${x+1} ${y+1} ${x} ${y+r}Q${x-1} ${y+1} ${x-r} ${y}Q${x-1} ${y-1} ${x} ${y-r}Z`}/>)}</g>
 </svg>;
}

export function ChoiceFrame(){
 const id='choice-frame-'+useId().replace(/:/g,'');
 return <svg className="celestial-frame" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id={id+'-rim'} x2="1" y2="1"><stop stopColor="#dfc9ac"/><stop offset=".3" stopColor="#ae8d83"/><stop offset=".5" stopColor="#f4dfca"/><stop offset=".8" stopColor="#947b8e"/><stop offset="1" stopColor="#e1c3a6"/></linearGradient><g id={id+'-crystal'}><path d="M0 0-10-20 0-42 10-20Z" fill="#9d88d3" stroke="#eedbdf" strokeWidth="1.1"/><path d="M0 0 0-42-4-20Z" fill="#e0d9ff"/><path d="m0 0-22-10-11-23 21 10Z" fill="#af96df" stroke="#d9c8e7"/><path d="m0 0 22-10 11-23-21 10Z" fill="#8266b2" stroke="#ddcae6"/></g></defs>
  <g fill="none" stroke={'url(#'+id+'-rim)'} strokeWidth="1.25"><rect x="13" y="13" width="974" height="574" rx="39"/><rect x="18" y="18" width="964" height="564" rx="36" strokeOpacity=".65"/>
   <path d="M13 104Q1 42 76 13M987 104Q999 42 924 13M13 496Q1 558 76 587M987 496Q999 558 924 587M425 13Q466 31 500 2Q534 31 575 13M442 587Q476 568 500 597Q524 568 558 587"/>
   <path d="M58 28V135M80 30V94M942 28V135M920 30V94" strokeDasharray="1 7" strokeOpacity=".75"/>
   <path d="M500 123H310M500 123H690" strokeOpacity=".5"/>
  </g>
  <g><use href={'#'+id+'-crystal'} transform="translate(27 35) rotate(-43) scale(.9)"/><use href={'#'+id+'-crystal'} transform="translate(973 35) rotate(43) scale(.9)"/><use href={'#'+id+'-crystal'} transform="translate(27 565) rotate(-137) scale(.9)"/><use href={'#'+id+'-crystal'} transform="translate(973 565) rotate(137) scale(.9)"/><use href={'#'+id+'-crystal'} transform="translate(500 26) scale(.9)"/><use href={'#'+id+'-crystal'} transform="translate(500 578) rotate(180) scale(.55)"/><use href={'#'+id+'-crystal'} transform="translate(500 132) scale(.32)"/></g>
  <g fill="#e7cff5" stroke="#e1c8b1" strokeWidth=".6">{[[58,148],[80,104],[942,148],[920,104],[13,300],[987,300]].map(([x,y])=><path key={x+','+y} d={`M${x} ${y-8} ${x+3} ${y-2} ${x+7} ${y} ${x+3} ${y+2} ${x} ${y+9} ${x-3} ${y+2} ${x-7} ${y} ${x-3} ${y-2}Z`}/>)}</g>
 </svg>;
}
