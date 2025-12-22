var Te=Object.defineProperty;var Fe=(d,e,a)=>e in d?Te(d,e,{enumerable:!0,configurable:!0,writable:!0,value:a}):d[e]=a;var l=(d,e,a)=>Fe(d,typeof e!="symbol"?e+"":e,a);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))t(i);new MutationObserver(i=>{for(const s of i)if(s.type==="childList")for(const n of s.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&t(n)}).observe(document,{childList:!0,subtree:!0});function a(i){const s={};return i.integrity&&(s.integrity=i.integrity),i.referrerPolicy&&(s.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?s.credentials="include":i.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function t(i){if(i.ep)return;i.ep=!0;const s=a(i);fetch(i.href,s)}})();class De{constructor(e){l(this,"gl");l(this,"canvas");this.canvas=e;const a=e.getContext("webgl2",{alpha:!1,antialias:!0,depth:!0});if(!a)throw new Error("WebGL2 not supported");this.gl=a,this.validateExtensions(),this.logInfo()}validateExtensions(){const e=["EXT_color_buffer_float"];for(const a of e)if(!this.gl.getExtension(a))throw new Error(`Required WebGL extension not available: ${a}`)}logInfo(){const e=this.gl;console.log("✓ WebGL2 Context Created"),console.log("  Vendor:",e.getParameter(e.VENDOR)),console.log("  Renderer:",e.getParameter(e.RENDERER)),console.log("  Version:",e.getParameter(e.VERSION)),console.log("  GLSL Version:",e.getParameter(e.SHADING_LANGUAGE_VERSION))}resize(e,a){this.canvas.width=e,this.canvas.height=a,this.gl.viewport(0,0,e,a)}clear(e,a,t){this.gl.clearColor(e,a,t,1),this.gl.clear(this.gl.COLOR_BUFFER_BIT|this.gl.DEPTH_BUFFER_BIT)}}const Oe=`#version 300 es
precision highp float;

in vec3 aPosition;
uniform mat4 uModelViewProjection;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
}
`,ke=`#version 300 es
precision highp float;

uniform vec3 uColor;
out vec4 fragColor;

void main() {
  fragColor = vec4(uColor, 1.0);
}
`,Ne=`#version 300 es
precision highp float;
precision highp sampler3D;

in vec3 aPosition;
uniform mat4 uModelViewProjection;
uniform float uPointSize;
uniform sampler3D uVolume;
uniform vec3 uVolumeRes; // Volume resolution (x, y, z) for density calculation

out vec4 vColor;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  
  // Sample volume data
  vec3 texCoord = (aPosition + 1.0) * 0.5;
  vec4 data = texture(uVolume, texCoord);
  
  // R = Magnitude, G = Phase, B = Custom1, A = Custom2
  float magnitude = data.r;
  float phase = data.g;
  
  // Calculate maximum point size based on grid density
  // Points should not be larger than the grid cell spacing
  float minRes = min(min(uVolumeRes.x, uVolumeRes.y), uVolumeRes.z);
  float maxPointSize = (2.0 / minRes) * 100.0; // Grid cell size in screen space (approximate)
  
  // Size based on magnitude with logarithmic scaling
  // Logarithmic scale makes low magnitudes more visible while preserving dynamics
  float size = uPointSize;
  if (magnitude > 0.001) {
      // log(1 + x*k) gives gentle compression, making dim points visible
      size = uPointSize * (1.0 + log(1.0 + magnitude * 20.0) * 1.5);
  }
  
  // Clamp to max size based on density
  size = min(size, maxPointSize);
  
  gl_PointSize = size;
  
  // Pass color to fragment shader
  // R channel = Magnitude (Red)
  // G channel = Phase (Green)
  // Mix them for visualization
  vColor = vec4(magnitude, phase, 0.2, magnitude); 
}
`,_e=`#version 300 es
precision highp float;

in vec4 vColor;
uniform float uAlpha;
out vec4 fragColor;

void main() {
  // Make points circular (not square)
  vec2 coord = gl_PointCoord - vec2(0.5);
  if (length(coord) > 0.5) discard;
  
  // Use color from vertex shader, modulate alpha
  // If magnitude is low, make it very transparent
  float alpha = uAlpha;
  if (vColor.r > 0.01) {
      alpha = uAlpha + vColor.r * 0.5; // More opacity for higher magnitude
  }
  
  fragColor = vec4(vColor.rgb, alpha);
}
`,Ve=`#version 300 es
precision highp float;
precision highp sampler3D;

in vec3 aPosition;
uniform mat4 uModelViewProjection;
uniform mat4 uModelMatrix; // To transform position to world space for sampling
uniform sampler3D uVolume;

out vec4 vColor;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  
  // Transform position to world space (which matches volume space [-1, 1])
  // Note: The plane is transformed by uModelMatrix (rotation/translation)
  // We need to sample the volume at this transformed position.
  // However, uModelViewProjection includes View and Projection.
  // We need a separate uModelMatrix to get world coordinates.
  // BUT, wait. The plane vertices are local to the plane.
  // The plane moves through the volume.
  // So we need to apply the plane's transformation to get volume coordinates.
  
  vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
  vec3 texCoord = (worldPos.xyz + 1.0) * 0.5;
  
  // Sample volume
  // Use trilinear filtering (hardware or manual if needed, but hardware linear is usually fine)
  vec4 data = texture(uVolume, texCoord);
  
  // Visualize data
  // R = Magnitude -> Red/Intensity
  // G = Phase -> Green/Variation
  float mag = data.r;
  float phase = data.g;
  
  // Base color (teal) mixed with data
  vec3 baseColor = vec3(0.0, 1.0, 0.5);
  vec3 activeColor = vec3(1.0, 0.2, 0.2); // Reddish for high magnitude
  
  // Mix based on magnitude
  vec3 finalColor = mix(baseColor, activeColor, mag);
  
  // Add phase influence to green channel
  finalColor.g += phase * 0.3;
  
  vColor = vec4(finalColor, 1.0);
}
`,ze=`#version 300 es
precision highp float;

in vec4 vColor;
uniform float uAlpha;
out vec4 fragColor;

void main() {
  fragColor = vec4(vColor.rgb, uAlpha);
}
`;function H(){const d=new Float32Array(16);return d[0]=d[5]=d[10]=d[15]=1,d}function Ue(d,e,a,t){const i=1/Math.tan(d/2),s=1/(a-t),n=new Float32Array(16);return n[0]=i/e,n[5]=i,n[10]=(t+a)*s,n[11]=-1,n[14]=2*t*a*s,n}function Be(d,e,a){const t=d[0]-e[0],i=d[1]-e[1],s=d[2]-e[2];let n=1/Math.sqrt(t*t+i*i+s*s);const r=t*n,o=i*n,h=s*n,c=a[1]*h-a[2]*o,u=a[2]*r-a[0]*h,g=a[0]*o-a[1]*r;n=1/Math.sqrt(c*c+u*u+g*g);const f=c*n,p=u*n,m=g*n,v=o*m-h*p,y=h*f-r*m,b=r*p-o*f,S=new Float32Array(16);return S[0]=f,S[1]=v,S[2]=r,S[4]=p,S[5]=y,S[6]=o,S[8]=m,S[9]=b,S[10]=h,S[12]=-(f*d[0]+p*d[1]+m*d[2]),S[13]=-(v*d[0]+y*d[1]+b*d[2]),S[14]=-(r*d[0]+o*d[1]+h*d[2]),S[15]=1,S}function X(d){const e=Math.cos(d),a=Math.sin(d),t=H();return t[5]=e,t[6]=a,t[9]=-a,t[10]=e,t}function $(d){const e=Math.cos(d),a=Math.sin(d),t=H();return t[0]=e,t[2]=-a,t[8]=a,t[10]=e,t}function se(d){const e=Math.cos(d),a=Math.sin(d),t=H();return t[0]=e,t[1]=a,t[4]=-a,t[5]=e,t}function ie(d,e,a){const t=H();return t[12]=d,t[13]=e,t[14]=a,t}function N(d,e){const a=new Float32Array(16);for(let t=0;t<4;t++)for(let i=0;i<4;i++)a[i*4+t]=d[0*4+t]*e[i*4+0]+d[1*4+t]*e[i*4+1]+d[2*4+t]*e[i*4+2]+d[3*4+t]*e[i*4+3];return a}function qe(d,e){const a=d[0],t=d[1],i=d[2],s=e[3]*a+e[7]*t+e[11]*i+e[15],n=s!==0?1/s:1;return[(e[0]*a+e[4]*t+e[8]*i+e[12])*n,(e[1]*a+e[5]*t+e[9]*i+e[13])*n,(e[2]*a+e[6]*t+e[10]*i+e[14])*n]}var q=(d=>(d.FLAT="PLANE",d.SINCOS="PLOT 1",d.WAVE="PLOT 2",d.RIPPLE="PLOT 3",d))(q||{});const Ge=16,We=512,fe=64,Ye=1,je=16,ge=2,He=16,Xe=1024,ve=128;var T=(d=>(d.SPECTRAL="iFFT Spectral",d.SPECTRAL_CHIRP="Chirp ICZT",d.WAVETABLE="Wavetable",d.WHITENOISE_BAND_Q_FILTER="Noise band filter",d))(T||{});const $e={lowCount:0,highCount:0,multiplier:.5},Se={scale:1,cReal:-.4,cImag:.6},ye={power:8,scale:1.2,iterations:12},be={iterations:4,scale:1,holeSize:.33},J={frequency:3,complexity:4,contrast:2},ee={density:.3,birthMin:5,surviveMin:4},ne="spectraltable_state",oe="spectraltable_presets";class Ze{constructor(e,a){l(this,"ctx");l(this,"texture",null);l(this,"resolution");l(this,"data",null);l(this,"gameOfLifeState",null);l(this,"gameOfLifeBuffer",null);l(this,"plasmaTime",0);l(this,"plasmaParams",J);l(this,"golParams",ee);this.ctx=e,this.resolution=a,this.initialize()}initialize(){const e=this.ctx.gl;if(this.texture&&e.deleteTexture(this.texture),this.texture=e.createTexture(),!this.texture)throw new Error("Failed to create 3D texture");e.bindTexture(e.TEXTURE_3D,this.texture);const{x:a,y:t,z:i}=this.resolution,s=a*t*i;(!this.data||this.data.length!==s*4)&&(this.data=new Float32Array(s*4),this.data.fill(0)),e.texImage3D(e.TEXTURE_3D,0,e.RGBA32F,a,t,i,0,e.RGBA,e.FLOAT,this.data),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_WRAP_R,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_3D,null);const n=s*4*4/(1024*1024);console.log(`✓ Spectral Volume: ${a}×${t}×${i} = ${s} voxels (${n.toFixed(2)} MB)`)}setData(e){const a=this.ctx.gl,{x:t,y:i,z:s}=this.resolution;if(e.length!==t*i*s*4)throw new Error("Data length does not match volume resolution");this.data=e,a.bindTexture(a.TEXTURE_3D,this.texture),a.texSubImage3D(a.TEXTURE_3D,0,0,0,0,t,i,s,a.RGBA,a.FLOAT,e),a.bindTexture(a.TEXTURE_3D,null)}generate3DJulia(e=Se){const{x:a,y:t,z:i}=this.resolution,s=a*t*i,n=new Float32Array(s*4),{scale:r,cReal:o,cImag:h}=e,c=16,u=8,g=o,f=h,p=0;let m=0;for(let v=0;v<i;v++)for(let y=0;y<t;y++)for(let b=0;b<a;b++){const S=(b/(a-1)*2-1)*r,M=(y/(t-1)*2-1)*r,w=(v/(i-1)*2-1)*r;let P=S,x=M,E=w,R=0,C=0;for(;C<c&&(R=Math.sqrt(P*P+x*x+E*E),!(R>2));C++){const F=Math.acos(E/(R+1e-4)),V=Math.atan2(x,P),z=Math.pow(R,u),U=F*u,Y=V*u;P=z*Math.sin(U)*Math.cos(Y)+g,x=z*Math.sin(U)*Math.sin(Y)+f,E=z*Math.cos(U)+p}let I=0;C===c?(I=.8-R*.3,I=Math.max(.2,Math.min(1,I))):C>3&&(I=(C-Math.log2(Math.log2(R+1)))/c*.6);const O=1+(1-b/a)*.4;I*=O,I=Math.min(1,I);const k=(C/c+S*.1)%1,D=(M/r+1)*.5,L=(w/r+1)*.5;n[m++]=I,n[m++]=k,n[m++]=D,n[m++]=L}this.setData(n)}generateMandelbulb(e=ye){const{x:a,y:t,z:i}=this.resolution,s=a*t*i,n=new Float32Array(s*4),{power:r,scale:o,iterations:h}=e,c=Math.round(h);let u=0;for(let g=0;g<i;g++)for(let f=0;f<t;f++)for(let p=0;p<a;p++){const m=(p/(a-1)*2-1)*o,v=(f/(t-1)*2-1)*o,y=(g/(i-1)*2-1)*o;let b=0,S=0,M=0,w=0,P=0;for(;P<c&&(w=Math.sqrt(b*b+S*S+M*M),!(w>2));P++){const O=Math.acos(M/(w+1e-4)),k=Math.atan2(S,b),D=Math.pow(w,r),L=O*r,F=k*r;b=D*Math.sin(L)*Math.cos(F)+m,S=D*Math.sin(L)*Math.sin(F)+v,M=D*Math.cos(L)+y}let x=0;P===c?(x=.9-w*.2,x=Math.max(.3,Math.min(1,x))):P>2&&(x=P/c*.5);const R=1+(1-p/a)*.4;x*=R,x=Math.min(1,x);const C=P/c,I=(v/o+1)*.5,A=(y/o+1)*.5;n[u++]=x,n[u++]=C,n[u++]=I,n[u++]=A}this.setData(n)}generateMengerSponge(e=be){const{x:a,y:t,z:i}=this.resolution,s=a*t*i,n=new Float32Array(s*4),{iterations:r,scale:o}=e,h=Math.round(r),c=(g,f,p)=>{let m=(g/o+1)*.5,v=(f/o+1)*.5,y=(p/o+1)*.5;for(let b=0;b<h;b++){m*=3,v*=3,y*=3;const S=Math.floor(m)%3,M=Math.floor(v)%3,w=Math.floor(y)%3,P=S===1,x=M===1,E=w===1;if((P?1:0)+(x?1:0)+(E?1:0)>=2)return!1;m=m%1,v=v%1,y=y%1}return!0};let u=0;for(let g=0;g<i;g++)for(let f=0;f<t;f++)for(let p=0;p<a;p++){const m=(p/(a-1)*2-1)*o,v=(f/(t-1)*2-1)*o,y=(g/(i-1)*2-1)*o,b=c(m,v,y);let S=b?.8:0;if(b){const R=Math.sin(m*10)*Math.sin(v*10)*Math.sin(y*10);S+=R*.1}const w=1+(1-p/a)*.3;S*=w,S=Math.max(0,Math.min(1,S));const P=((m+v+y)/o+3)/6%1,x=(v/o+1)*.5,E=(y/o+1)*.5;n[u++]=S,n[u++]=P,n[u++]=x,n[u++]=E}this.setData(n)}generateSinePlasma(e=0,a=J){this.plasmaParams=a;const{x:t,y:i,z:s}=this.resolution,n=t*i*s,r=new Float32Array(n*4),{frequency:o,complexity:h,contrast:c}=a;let u=0;for(let g=0;g<s;g++)for(let f=0;f<i;f++)for(let p=0;p<t;p++){const m=p/t*2-1,v=f/i*2-1,y=g/s*2-1;let b=0;const S=Math.round(h);if(b+=Math.sin(m*o+e),b+=Math.sin(v*o*.8+e*.8),b+=Math.sin(y*o*.6+e*1.2),S>1&&(b+=Math.sin((m+v+y)*o*.7+e*.5)),S>2){const I=Math.sqrt(m*m+v*v+y*y);b+=Math.sin(I*o*2-e*1.5)}if(S>3){const I=Math.atan2(v,m);b+=Math.sin(I*3+y*o+e)}const M=3+Math.min(S-1,3);let w=(b+M)/(M*2);w=(Math.sin(w*10*c)+1)*.5,w=Math.pow(w,c);const x=1+(1-p/t)*.5;w*=x,w=Math.max(0,Math.min(.95,w));const E=(w+e*.2)%1,R=(Math.sin(m*Math.PI+e)+1)*.5,C=(Math.cos(v*Math.PI+e)+1)*.5;r[u++]=w,r[u++]=E,r[u++]=R,r[u++]=C}this.setData(r)}stepSinePlasma(){this.plasmaTime+=.02,this.generateSinePlasma(this.plasmaTime,this.plasmaParams)}clearData(){const{x:e,y:a,z:t}=this.resolution,i=e*a*t,s=new Float32Array(i*4);s.fill(0),this.setData(s)}sample(e,a,t){if(!this.data)return new Float32Array([0,0,0,0]);const{x:i,y:s,z:n}=this.resolution,r=Math.max(0,Math.min(1,e)),o=Math.max(0,Math.min(1,a)),h=Math.max(0,Math.min(1,t)),c=r*(i-1),u=o*(s-1),g=h*(n-1),f=Math.floor(c),p=Math.floor(u),m=Math.floor(g),v=c-f,y=u-p,b=g-m,S=Math.min(f+1,i-1),M=Math.min(p+1,s-1),w=Math.min(m+1,n-1),P=(L,F,V)=>(V*s*i+F*i+L)*4,x=P(f,p,m),E=P(S,p,m),R=P(f,M,m),C=P(S,M,m),I=P(f,p,w),A=P(S,p,w),O=P(f,M,w),k=P(S,M,w),D=new Float32Array(4);for(let L=0;L<4;L++){const F=this.data[x+L],V=this.data[E+L],z=this.data[R+L],U=this.data[C+L],Y=this.data[I+L],we=this.data[A+L],Ce=this.data[O+L],Me=this.data[k+L],xe=F*(1-v)+V*v,Ee=z*(1-v)+U*v,Ae=Y*(1-v)+we*v,Re=Ce*(1-v)+Me*v,Le=xe*(1-y)+Ee*y,Ie=Ae*(1-y)+Re*y;D[L]=Le*(1-b)+Ie*b}return D}updateResolution(e){this.resolution=e,this.data=null,this.initialize()}getResolution(){return{...this.resolution}}getTexture(){return this.texture}destroy(){this.texture&&(this.ctx.gl.deleteTexture(this.texture),this.texture=null),this.data=null,this.gameOfLifeState=null,this.gameOfLifeBuffer=null}initGameOfLife(e=ee){this.golParams=e;const{x:a,y:t,z:i}=this.resolution,s=a*t*i;this.gameOfLifeState=new Uint8Array(s),this.gameOfLifeBuffer=new Uint8Array(s);for(let n=0;n<s;n++)this.gameOfLifeState[n]=Math.random()<e.density?1:0;this.gameOfLifeToSpectral()}stepGameOfLife(){if(!this.gameOfLifeState||!this.gameOfLifeBuffer)return;const{x:e,y:a,z:t}=this.resolution,{birthMin:i,surviveMin:s}=this.golParams,n=(o,h,c)=>{const u=(o%e+e)%e,g=(h%a+a)%a;return(c%t+t)%t*a*e+g*e+u};for(let o=0;o<t;o++)for(let h=0;h<a;h++)for(let c=0;c<e;c++){const u=n(c,h,o);let g=0;for(let p=-1;p<=1;p++)for(let m=-1;m<=1;m++)for(let v=-1;v<=1;v++){if(v===0&&m===0&&p===0)continue;const y=n(c+v,h+m,o+p);g+=this.gameOfLifeState[y]}this.gameOfLifeState[u]===1?this.gameOfLifeBuffer[u]=g>=s&&g<=s+1?1:0:this.gameOfLifeBuffer[u]=g===i?1:0}const r=this.gameOfLifeState;this.gameOfLifeState=this.gameOfLifeBuffer,this.gameOfLifeBuffer=r,this.gameOfLifeToSpectral()}gameOfLifeToSpectral(){if(!this.gameOfLifeState)return;const{x:e,y:a,z:t}=this.resolution,i=e*a*t,s=new Float32Array(i*4);let n=0;for(let r=0;r<t;r++)for(let o=0;o<a;o++)for(let h=0;h<e;h++){const c=r*a*e+o*e+h,u=this.gameOfLifeState[c],g=h/e*2-1,f=o/a*2-1,p=r/t*2-1;let m=u?.8:0;if(u){const S=1+(1-(g+1)*.5)*.4;m*=S}const v=(h/e+o/a+r/t)/3,y=(f+1)*.5,b=(p+1)*.5;s[n++]=m,s[n++]=v,s[n++]=y,s[n++]=b}this.setData(s)}}class Z{static calculateHeight(e,a,t,i=0){switch(t){case q.FLAT:return 0;case q.SINCOS:return .3*(Math.sin((e+i)*Math.PI*2)*Math.cos((a+i)*Math.PI*2));case q.WAVE:return .2*Math.sin((e+a+i)*Math.PI*3);case q.RIPPLE:const s=Math.sqrt(e*e+a*a);return .25*Math.sin((s-i)*Math.PI*4)/(1+s*2);default:return 0}}static generatePlane(e,a=32,t=0){const i=[],s=[];for(let n=0;n<a;n++)for(let r=0;r<a;r++){const o=r/(a-1)*2-1,h=n/(a-1)*2-1,c=this.calculateHeight(o,h,e,t);i.push(o,c,h)}for(let n=0;n<a-1;n++)for(let r=0;r<a-1;r++){const o=n*a+r,h=o+1,c=(n+1)*a+r,u=c+1;r<a-1&&(s.push(o,h),s.push(c,u)),n<a-1&&(s.push(o,c),s.push(h,u))}return{positions:new Float32Array(i),indices:new Uint16Array(s)}}static generateReadingLine(e,a,t=0,i=0){const s=[],n=Math.max(-1,Math.min(1,t));for(let r=0;r<a;r++){const o=r/(a-1)*2-1,h=this.calculateHeight(o,n,e,i);s.push(o,h,n)}return new Float32Array(s)}}class Ke{constructor(e,a){l(this,"ctx");l(this,"wireframeProgram");l(this,"wireframeVAO");l(this,"wireframeUMVP");l(this,"wireframeUColor");l(this,"pointProgram");l(this,"pointVAO",null);l(this,"pointCount",0);l(this,"pointUMVP");l(this,"pointUVolume");l(this,"pointUAlpha");l(this,"pointUSize");l(this,"pointUVolumeRes");l(this,"planeProgram");l(this,"planeVAO",null);l(this,"planeIndexCount",0);l(this,"planeUMVP");l(this,"planeUModel");l(this,"planeUVolume");l(this,"planeUAlpha");l(this,"lineVAO",null);l(this,"lineUMVP");l(this,"lineUColor");l(this,"lineVertexCount",0);l(this,"axesVAO",null);l(this,"axesCounts",[0,0,0]);l(this,"axesUMVP");l(this,"axesUColor");l(this,"spectralVolume");l(this,"pathState",{position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scanPosition:0,planeType:q.FLAT,shapePhase:0});l(this,"rotationX",.3);l(this,"rotationY",.4);l(this,"cameraDistance",6.5);l(this,"isDragging",!1);l(this,"lastMouseX",0);l(this,"lastMouseY",0);l(this,"activeMouseButton",-1);this.ctx=e,this.spectralVolume=new Ze(e,a),this.wireframeProgram=this.createProgram(Oe,ke);const t=e.gl.getUniformLocation(this.wireframeProgram,"uModelViewProjection"),i=e.gl.getUniformLocation(this.wireframeProgram,"uColor");if(!t||!i)throw new Error("Failed to get wireframe uniform locations");this.wireframeUMVP=t,this.wireframeUColor=i,this.wireframeVAO=this.createWireframeCube(),this.axesUMVP=t,this.axesUColor=i,this.updateAxesGeometry(),this.pointProgram=this.createProgram(Ne,_e);const s=e.gl.getUniformLocation(this.pointProgram,"uModelViewProjection"),n=e.gl.getUniformLocation(this.pointProgram,"uVolume"),r=e.gl.getUniformLocation(this.pointProgram,"uAlpha"),o=e.gl.getUniformLocation(this.pointProgram,"uPointSize"),h=e.gl.getUniformLocation(this.pointProgram,"uVolumeRes");if(!s||!r||!o)throw new Error("Failed to get point uniform locations");this.pointUMVP=s,this.pointUVolume=n,this.pointUAlpha=r,this.pointUSize=o,this.pointUVolumeRes=h,this.planeProgram=this.createProgram(Ve,ze);const c=e.gl.getUniformLocation(this.planeProgram,"uModelViewProjection"),u=e.gl.getUniformLocation(this.planeProgram,"uModelMatrix"),g=e.gl.getUniformLocation(this.planeProgram,"uVolume"),f=e.gl.getUniformLocation(this.planeProgram,"uAlpha");if(!c||!f)throw new Error("Failed to get plane uniform locations");this.planeUMVP=c,this.planeUModel=u,this.planeUVolume=g,this.planeUAlpha=f,this.lineUMVP=t,this.lineUColor=i,this.updatePointCloud(a),this.updateReadingPathGeometry(),console.log("✓ Renderer initialized")}generateCharGeometry(e,a,t,i,s){const n=[],r=s,o=(h,c,u,g)=>{n.push(a+h*r,t+c*r,i),n.push(a+u*r,t+g*r,i)};switch(e.toUpperCase()){case"T":o(0,2,2,2),o(1,2,1,0);break;case"I":o(1,2,1,0);break;case"M":o(0,0,0,2),o(2,0,2,2),o(0,2,1,1),o(1,1,2,2);break;case"E":o(0,2,2,2),o(0,1,1.5,1),o(0,0,2,0),o(0,0,0,2);break;case"O":o(0,0,2,0),o(2,0,2,2),o(2,2,0,2),o(0,2,0,0);break;case"R":o(0,0,0,2),o(0,2,2,2),o(2,2,2,1),o(2,1,0,1),o(0,1,2,0);break;case"P":o(0,0,0,2),o(0,2,2,2),o(2,2,2,1),o(2,1,0,1);break;case"H":o(0,0,0,2),o(2,0,2,2),o(0,1,2,1);break;case"A":o(0,0,0,1.5),o(2,0,2,1.5),o(0,1.5,1,2),o(2,1.5,1,2),o(0,1,2,1);break;case"B":o(0,0,0,2),o(0,2,1.5,2),o(1.5,2,2,1.5),o(2,1.5,1.5,1),o(1.5,1,0,1),o(0,1,1.5,1),o(1.5,1,2,.5),o(2,.5,1.5,0),o(1.5,0,0,0);break;case"N":o(0,0,0,2),o(2,0,2,2),o(0,2,2,0);break;case"S":o(2,2,0,2),o(0,2,0,1),o(0,1,2,1),o(2,1,2,0),o(2,0,0,0);break}return n}generateTextString(e,a,t,i,s,n){const r=[];let o=0;for(let h=0;h<e.length;h++){const c=e[h];let u=a,g=t,f=i;if(n==="x"){u+=o;const p=this.generateCharGeometry(c,u,g,f,s);r.push(...p),o+=s*3}else if(n==="y"){g+=o;const p=this.generateCharGeometry(c,u,g,f,s);r.push(...p),o+=s*3}else{f+=o;const p=this.generateCharGeometry(c,0,g,0,s);for(let m=0;m<p.length;m+=3)r.push(u,p[m+1],f+p[m]);o+=s*3}}return r}updateAxesGeometry(){const e=this.ctx.gl;this.axesVAO&&e.deleteVertexArray(this.axesVAO);const a=[],t=-1.2,i=1,s=.05,n=a.length/3;a.push(t,t,t),a.push(t+i,t,t);const r=t+i;a.push(r,t,t,r-s,t+s,t),a.push(r,t,t,r-s,t-s,t),a.push(r,t,t,r-s,t,t+s),a.push(r,t,t,r-s,t,t-s);const o=this.generateTextString("BINS",t+.2,t-.2,t,.05,"x");a.push(...o);const h=a.length/3-n,c=a.length/3;a.push(t,t,t),a.push(t,t+i,t);const u=t+i;a.push(t,u,t,t+s,u-s,t),a.push(t,u,t,t-s,u-s,t),a.push(t,u,t,t,u-s,t+s),a.push(t,u,t,t,u-s,t-s);const g=this.generateTextString("MORPH",t-.2,t+.2,t,.05,"y");a.push(...g);const f=a.length/3-c,p=a.length/3;a.push(t,t,t),a.push(t,t,t+i);const m=t+i;a.push(t,t,m,t+s,t,m-s),a.push(t,t,m,t-s,t,m-s),a.push(t,t,m,t,t+s,m-s),a.push(t,t,m,t,t-s,m-s);const v=this.generateTextString("PHASE",t-.2,t,t+.2,.05,"z");a.push(...v);const y=a.length/3-p;this.axesCounts=[h,f,y];const b=e.createVertexArray();if(!b)throw new Error("Failed axes VAO");e.bindVertexArray(b);const S=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,S),e.bufferData(e.ARRAY_BUFFER,new Float32Array(a),e.STATIC_DRAW);const M=e.getAttribLocation(this.wireframeProgram,"aPosition");e.enableVertexAttribArray(M),e.vertexAttribPointer(M,3,e.FLOAT,!1,0,0),e.bindVertexArray(null),this.axesVAO=b}createProgram(e,a){const t=this.ctx.gl,i=t.createShader(t.VERTEX_SHADER);if(!i)throw new Error("Failed to create vertex shader");if(t.shaderSource(i,e),t.compileShader(i),!t.getShaderParameter(i,t.COMPILE_STATUS)){const r=t.getShaderInfoLog(i);throw new Error(`Vertex shader compile error: ${r}`)}const s=t.createShader(t.FRAGMENT_SHADER);if(!s)throw new Error("Failed to create fragment shader");if(t.shaderSource(s,a),t.compileShader(s),!t.getShaderParameter(s,t.COMPILE_STATUS)){const r=t.getShaderInfoLog(s);throw new Error(`Fragment shader compile error: ${r}`)}const n=t.createProgram();if(!n)throw new Error("Failed to create program");if(t.attachShader(n,i),t.attachShader(n,s),t.linkProgram(n),!t.getProgramParameter(n,t.LINK_STATUS)){const r=t.getProgramInfoLog(n);throw new Error(`Program link error: ${r}`)}return n}createWireframeCube(){const e=this.ctx.gl,a=new Float32Array([-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1]),t=new Uint16Array([0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7]),i=e.createVertexArray();if(!i)throw new Error("Failed to create VAO");e.bindVertexArray(i);const s=e.createBuffer();if(!s)throw new Error("Failed to create vertex buffer");e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,a,e.STATIC_DRAW);const n=e.getAttribLocation(this.wireframeProgram,"aPosition");e.enableVertexAttribArray(n),e.vertexAttribPointer(n,3,e.FLOAT,!1,0,0);const r=e.createBuffer();if(!r)throw new Error("Failed to create index buffer");return e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,r),e.bufferData(e.ELEMENT_ARRAY_BUFFER,t,e.STATIC_DRAW),e.bindVertexArray(null),i}generatePointCloud(e){const{x:a,y:t,z:i}=e,s=a*t*i,n=new Float32Array(s*3);let r=0;for(let o=0;o<i;o++)for(let h=0;h<t;h++)for(let c=0;c<a;c++)n[r++]=c/(a-1)*2-1,n[r++]=h/(t-1)*2-1,n[r++]=o/(i-1)*2-1;return n}updatePointCloud(e){const a=this.ctx.gl;this.pointVAO&&a.deleteVertexArray(this.pointVAO);const t=this.generatePointCloud(e);this.pointCount=t.length/3;const i=a.createVertexArray();if(!i)throw new Error("Failed to create point VAO");a.bindVertexArray(i);const s=a.createBuffer();if(!s)throw new Error("Failed to create point buffer");a.bindBuffer(a.ARRAY_BUFFER,s),a.bufferData(a.ARRAY_BUFFER,t,a.STATIC_DRAW);const n=a.getAttribLocation(this.pointProgram,"aPosition");a.enableVertexAttribArray(n),a.vertexAttribPointer(n,3,a.FLOAT,!1,0,0),a.bindVertexArray(null),this.pointVAO=i,console.log(`✓ Point cloud: ${this.pointCount} points`)}updateReadingPathGeometry(){const e=this.ctx.gl;this.planeVAO&&e.deleteVertexArray(this.planeVAO);const{positions:a,indices:t}=Z.generatePlane(this.pathState.planeType,32,this.pathState.shapePhase);this.planeIndexCount=t.length;const i=e.createVertexArray();if(!i)throw new Error("Failed to create plane VAO");e.bindVertexArray(i);const s=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,a,e.STATIC_DRAW);const n=e.getAttribLocation(this.planeProgram,"aPosition");e.enableVertexAttribArray(n),e.vertexAttribPointer(n,3,e.FLOAT,!1,0,0);const r=e.createBuffer();e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,r),e.bufferData(e.ELEMENT_ARRAY_BUFFER,t,e.STATIC_DRAW),e.bindVertexArray(null),this.planeVAO=i;const o=this.spectralVolume.getResolution();this.updateReadingLineGeometry(o.x)}updateReadingLineGeometry(e){const a=this.ctx.gl;this.lineVAO&&a.deleteVertexArray(this.lineVAO);const t=Z.generateReadingLine(this.pathState.planeType,e,this.pathState.scanPosition,this.pathState.shapePhase);this.lineVertexCount=t.length/3;const i=a.createVertexArray();if(!i)throw new Error("Failed to create line VAO");a.bindVertexArray(i);const s=a.createBuffer();a.bindBuffer(a.ARRAY_BUFFER,s),a.bufferData(a.ARRAY_BUFFER,t,a.DYNAMIC_DRAW);const n=a.getAttribLocation(this.wireframeProgram,"aPosition");a.enableVertexAttribArray(n),a.vertexAttribPointer(n,3,a.FLOAT,!1,0,0),a.bindVertexArray(null),this.lineVAO=i}render(e=.016){this.update(e);const a=this.ctx.gl;this.ctx.clear(.08,.08,.12),a.enable(a.BLEND),a.blendFunc(a.SRC_ALPHA,a.ONE_MINUS_SRC_ALPHA);const t=a.canvas.width/a.canvas.height,i=Ue(Math.PI/4,t,.1,100),s=Be([0,0,this.cameraDistance],[0,0,0],[0,1,0]),n=X(this.rotationX),r=$(this.rotationY),o=N(r,n),h=N(s,o),c=N(i,h);if(this.axesVAO){a.useProgram(this.wireframeProgram),a.uniformMatrix4fv(this.axesUMVP,!1,c),a.bindVertexArray(this.axesVAO);let S=0;const[M,w,P]=this.axesCounts;a.uniform3f(this.axesUColor,1,.3,.3),a.drawArrays(a.LINES,S,M),S+=M,a.uniform3f(this.axesUColor,.3,1,.3),a.drawArrays(a.LINES,S,w),S+=w,a.uniform3f(this.axesUColor,.4,.4,1),a.drawArrays(a.LINES,S,P),a.bindVertexArray(null)}if(this.pointVAO){a.useProgram(this.pointProgram),a.uniformMatrix4fv(this.pointUMVP,!1,c),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_3D,this.spectralVolume.getTexture()),a.uniform1i(this.pointUVolume,0),a.uniform1f(this.pointUAlpha,.15),a.uniform1f(this.pointUSize,3);const S=this.spectralVolume.getResolution();a.uniform3f(this.pointUVolumeRes,S.x,S.y,S.z),a.bindVertexArray(this.pointVAO),a.drawArrays(a.POINTS,0,this.pointCount),a.bindVertexArray(null)}const u=X(this.pathState.rotation.x),g=$(this.pathState.rotation.y),f=se(this.pathState.rotation.z),p=ie(this.pathState.position.x,this.pathState.position.y,this.pathState.position.z);let m=N(g,u);m=N(f,m),m=N(p,m);const v=N(o,m),y=N(s,v),b=N(i,y);this.planeVAO&&(a.useProgram(this.planeProgram),a.uniformMatrix4fv(this.planeUMVP,!1,b),a.uniformMatrix4fv(this.planeUModel,!1,v),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_3D,this.spectralVolume.getTexture()),a.uniform1i(this.planeUVolume,0),a.uniform1f(this.planeUAlpha,.3),a.bindVertexArray(this.planeVAO),a.drawElements(a.LINES,this.planeIndexCount,a.UNSIGNED_SHORT,0),a.bindVertexArray(null)),this.lineVAO&&(a.useProgram(this.wireframeProgram),a.uniformMatrix4fv(this.lineUMVP,!1,b),a.uniform3f(this.lineUColor,.2,1,.2),a.bindVertexArray(this.lineVAO),a.drawArrays(a.LINE_STRIP,0,this.lineVertexCount),a.bindVertexArray(null)),a.useProgram(this.wireframeProgram),a.uniformMatrix4fv(this.wireframeUMVP,!1,c),a.uniform3f(this.wireframeUColor,.3,.6,1),a.bindVertexArray(this.wireframeVAO),a.drawElements(a.LINES,24,a.UNSIGNED_SHORT,0),a.bindVertexArray(null),a.disable(a.BLEND)}resize(e,a){this.ctx.resize(e,a)}updateVolumeResolution(e){this.spectralVolume.updateResolution(e),this.updatePointCloud(e),this.updateReadingPathGeometry(),this.updateReadingLineGeometry(e.x)}getSpectralVolume(){return this.spectralVolume}updateReadingPath(e){const a=e.planeType!==this.pathState.planeType,t=e.scanPosition!==this.pathState.scanPosition,i=e.shapePhase!==this.pathState.shapePhase;if(this.pathState={...e,rotation:{x:this.pathState.rotation.x,y:e.rotation.y,z:this.pathState.rotation.z}},a||i)this.updateReadingPathGeometry();else if(t){const s=this.spectralVolume.getResolution();this.updateReadingLineGeometry(s.x)}}updateSpectralData(e,a){switch(e){case"3d-julia":this.spectralVolume.generate3DJulia(a);break;case"mandelbulb":this.spectralVolume.generateMandelbulb(a);break;case"menger-sponge":this.spectralVolume.generateMengerSponge(a);break;case"sine-plasma":this.spectralVolume.generateSinePlasma(0,a);break;case"game-of-life":this.spectralVolume.initGameOfLife(a);break;default:this.spectralVolume.clearData();break}}getReadingLineSpectralData(){const e=this.spectralVolume.getResolution(),a=Z.generateReadingLine(this.pathState.planeType,e.x,this.pathState.scanPosition,this.pathState.shapePhase),t=X(this.pathState.rotation.x),i=$(this.pathState.rotation.y),s=se(this.pathState.rotation.z),n=ie(this.pathState.position.x,this.pathState.position.y,this.pathState.position.z);let r=N(i,t);r=N(s,r),r=N(n,r);const o=a.length/3,h=new Float32Array(o*4);for(let c=0;c<o;c++){const u=a[c*3],g=a[c*3+1],f=a[c*3+2],p=qe([u,g,f],r),m=(p[0]+1)*.5,v=(p[1]+1)*.5,y=(p[2]+1)*.5,b=this.spectralVolume.sample(m,v,y);h[c*4]=b[0],h[c*4+1]=b[1],h[c*4+2]=b[2],h[c*4+3]=b[3]}return h}onMouseDown(e,a,t){this.isDragging=!0,this.lastMouseX=e,this.lastMouseY=a,this.activeMouseButton=t}onMouseMove(e,a){if(!this.isDragging)return;const t=e-this.lastMouseX,i=a-this.lastMouseY;this.lastMouseX=e,this.lastMouseY=a;const s=.01;this.activeMouseButton===2?(this.rotationY+=t*s,this.rotationX+=i*s):this.activeMouseButton===0&&(this.pathState.rotation.z-=t*s,this.pathState.rotation.x-=i*s,this.pathState.rotation.x=Math.max(-Math.PI/3,Math.min(Math.PI/3,this.pathState.rotation.x)),this.pathState.rotation.z=Math.max(-Math.PI/3,Math.min(Math.PI/3,this.pathState.rotation.z)))}onMouseUp(){this.isDragging=!1,this.activeMouseButton=-1}zoom(e){this.cameraDistance+=e*.005,this.cameraDistance=Math.max(2,Math.min(20,this.cameraDistance))}resetView(){this.rotationX=.3,this.rotationY=.4,this.cameraDistance=6.5}update(e){if(!this.isDragging){const a=5*e;this.pathState.rotation.x+=(0-this.pathState.rotation.x)*a,this.pathState.rotation.z+=(0-this.pathState.rotation.z)*a,Math.abs(this.pathState.rotation.x)<.001&&(this.pathState.rotation.x=0),Math.abs(this.pathState.rotation.z)<.001&&(this.pathState.rotation.z=0)}}destroy(){this.spectralVolume.destroy()}}class Qe{constructor(){l(this,"presets",[]);l(this,"onPresetsChange",null);this.loadPresets()}loadPresets(){try{const e=localStorage.getItem(oe);e&&(this.presets=JSON.parse(e))}catch(e){console.warn("Failed to load presets:",e),this.presets=[]}}savePresets(){try{localStorage.setItem(oe,JSON.stringify(this.presets)),this.onPresetsChange&&this.onPresetsChange()}catch(e){console.warn("Failed to save presets:",e)}}getPresets(){return[...this.presets]}savePreset(e,a){const t={name:e,timestamp:Date.now(),controls:a},i=this.presets.findIndex(s=>s.name===e);i>=0?this.presets[i]=t:this.presets.push(t),this.savePresets(),console.log(`✓ Preset saved: ${e}`)}deletePreset(e){const a=this.presets.findIndex(t=>t.name===e);return a>=0?(this.presets.splice(a,1),this.savePresets(),console.log(`✓ Preset deleted: ${e}`),!0):!1}getPreset(e){return this.presets.find(a=>a.name===e)}saveCurrentState(e){try{localStorage.setItem(ne,JSON.stringify(e))}catch(a){console.warn("Failed to save state:",a)}}loadCurrentState(){try{const e=localStorage.getItem(ne);if(e)return JSON.parse(e)}catch(e){console.warn("Failed to load state:",e)}return null}setPresetsChangeCallback(e){this.onPresetsChange=e}}const B={sine:'<svg viewBox="0 0 24 20"><path d="M 2 10 Q 7 0 12 10 T 22 10" fill="none" stroke="currentColor" stroke-width="2"/></svg>',saw:'<svg viewBox="0 0 24 20"><path d="M 2 18 L 18 2 L 18 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',square:'<svg viewBox="0 0 24 20"><path d="M 2 18 L 2 2 L 12 2 L 12 18 L 22 18 L 22 2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',triangle:'<svg viewBox="0 0 24 20"><path d="M 2 18 L 12 2 L 22 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',none:'<svg viewBox="0 0 24 20"></svg>'},re={"Wave/Spectral Volume":`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M 32 10 L 58 24 L 58 52 L 32 64 L 6 52 L 6 24 Z" />
        <path d="M 32 10 L 32 38 L 58 24" />
        <path d="M 32 38 L 6 24" />
        <path d="M 32 38 L 32 64" />
    </svg>`,"Audio Synthesis":`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M 5 32 Q 15 10 25 32 T 45 32" />
        <path d="M 45 32 L 45 15 L 60 32 L 45 49 L 45 32" />
        <circle cx="15" cy="32" r="2" fill="currentColor" />
    </svg>`,"Reading Path":`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M 10 50 L 50 50 M 10 50 L 10 10 M 10 50 L 40 30" stroke-opacity="0.3" />
        <path d="M 8 40 C 20 40, 30 10, 55 15" stroke-width="2" />
        <circle cx="55" cy="15" r="3" fill="currentColor" />
    </svg>`,LFOs:`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="32" cy="32" r="28" stroke-dasharray="4 4" stroke-opacity="0.3" />
        <path d="M 12 32 C 12 10, 32 10, 32 32 C 32 54, 52 54, 52 32" />
        <path d="M 50 32 L 54 32" />
    </svg>`,Visualization:`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="8" y="40" width="8" height="16" />
        <rect x="20" y="25" width="8" height="31" />
        <rect x="32" y="35" width="8" height="21" />
        <rect x="44" y="15" width="8" height="41" />
        <path d="M 5 56 L 59 56" />
    </svg>`},ae="knob";function Je(d,e,a=ae){const t=document.createElement("div");t.className="control-card",a==="knob"&&t.classList.add("knob-layout");const i=document.createElement("div");if(i.className="control-section-title",i.textContent=e,re[e]){const s=document.createElement("div");s.className="section-icon",s.innerHTML=re[e],t.appendChild(s)}return t.appendChild(i),d.appendChild(t),t}function _(d,e,a,t,i,s,n,r,o=ae){const h=document.createElement("div");h.className="control-group",o==="knob"&&h.classList.add("knob-centered");const c=document.createElement("label");c.htmlFor=e,c.textContent=a;const u=document.createElement("span");u.className="value-display",u.id=`${e}-value`;const g=p=>{u.textContent=n>=1?String(Math.round(p)):p.toFixed(2)};g(s);const f=document.createElement("input");if(f.type="range",f.id=e,f.min=String(t),f.max=String(i),f.value=String(s),f.step=String(n),f.className="slider",f.addEventListener("input",()=>{const p=parseFloat(f.value);g(p),r&&r(p)}),o==="knob")f.style.display="none",h.appendChild(c),h.appendChild(Pe(f)),h.appendChild(u);else{const p=document.createElement("div");p.className="label-row",p.appendChild(c),p.appendChild(u),h.appendChild(p),h.appendChild(f)}return d.appendChild(h),f}function Pe(d){const e=document.createElement("div");e.className="knob-container",d.disabled&&e.classList.add("disabled");const a=document.createElementNS("http://www.w3.org/2000/svg","svg");a.setAttribute("viewBox","0 0 48 48"),a.setAttribute("class","knob-svg");const t=document.createElementNS("http://www.w3.org/2000/svg","path");t.setAttribute("class","knob-track"),t.setAttribute("d",K(24,24,18,225,495)),a.appendChild(t);const i=document.createElementNS("http://www.w3.org/2000/svg","path");i.setAttribute("class","knob-value"),a.appendChild(i);const s=document.createElementNS("http://www.w3.org/2000/svg","path");s.setAttribute("class","knob-mod-range"),a.appendChild(s);const n=document.createElementNS("http://www.w3.org/2000/svg","circle");n.setAttribute("class","knob-center"),n.setAttribute("cx","24"),n.setAttribute("cy","24"),n.setAttribute("r","14"),a.appendChild(n);const r=document.createElementNS("http://www.w3.org/2000/svg","circle");r.setAttribute("class","knob-pointer"),r.setAttribute("r","2"),a.appendChild(r),e.appendChild(a);const o=()=>{const p=parseFloat(d.value),m=parseFloat(d.min),v=parseFloat(d.max),b=225+(p-m)/(v-m)*270;i.setAttribute("d",K(24,24,18,225,b));const S=d;if(S.hasModulation){const x=typeof S.modOffset=="number"?S.modOffset:0,E=typeof S.modAmplitude=="number"?S.modAmplitude:0,R=x-E,C=x+E,I=(R-m)/(v-m),A=(C-m)/(v-m),O=225+Math.max(0,Math.min(1,I))*270,k=225+Math.max(0,Math.min(1,A))*270;Math.abs(k-O)>.1?(s.setAttribute("d",K(24,24,21.5,O,k)),s.style.display="block"):s.style.display="none"}else s.style.display="none";const M=(b-90)*(Math.PI/180),w=24+10*Math.cos(M),P=24+10*Math.sin(M);r.setAttribute("cx",String(w)),r.setAttribute("cy",String(P)),d.disabled?e.classList.add("disabled"):e.classList.remove("disabled")};let h=!1,c=0,u=0;e.addEventListener("mousedown",p=>{if(d.disabled)return;h=!0,c=p.clientY,u=parseFloat(d.value),document.body.style.cursor="ns-resize";const m=y=>{if(!h)return;const b=c-y.clientY,M=(parseFloat(d.max)-parseFloat(d.min))/200;let w=u+b*M;const P=parseFloat(d.step)||.01;w=Math.round(w/P)*P,w=Math.max(parseFloat(d.min),Math.min(parseFloat(d.max),w)),d.value=String(w),d.dispatchEvent(new Event("input")),o()},v=()=>{h=!1,document.body.style.cursor="",window.removeEventListener("mousemove",m),window.removeEventListener("mouseup",v)};window.addEventListener("mousemove",m),window.addEventListener("mouseup",v)}),new MutationObserver(()=>o()).observe(d,{attributes:!0,attributeFilter:["value","disabled"]});const f=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;return f&&Object.defineProperty(d,"value",{set:function(p){f.call(this,p),o()},get:Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.get,configurable:!0}),d.updateKnob=o,o(),e}function le(d,e,a,t){const i=(t-90)*Math.PI/180;return{x:d+a*Math.cos(i),y:e+a*Math.sin(i)}}function K(d,e,a,t,i){const s=le(d,e,a,i),n=le(d,e,a,t),r=i-t<=180?"0":"1";return["M",s.x,s.y,"A",a,a,0,r,0,n.x,n.y].join(" ")}function G(d,e,a,t,i){const s=document.createElement("div");s.className="control-group";const n=document.createElement("label");n.htmlFor=e,n.textContent=a;const r=document.createElement("select");r.id=e,t.forEach(h=>{const c=document.createElement("option");typeof h=="string"?(c.value=h,c.textContent=h):(c.value=h.value,c.textContent=h.label),r.appendChild(c)}),i&&r.addEventListener("change",()=>i(r.value));const o=document.createElement("div");return o.className="label-row",o.appendChild(n),s.appendChild(o),s.appendChild(r),d.appendChild(s),r}function j(d,e,a,t,i="reset-button"){const s=document.createElement("div");s.className="control-group";const n=document.createElement("button");return n.id=e,n.textContent=a,n.className=i,n.addEventListener("click",t),s.appendChild(n),d.appendChild(s),n}function he(d,e,a,t,i,s,n,r,o,h,c=ae){const u=document.createElement("div");u.className="control-group",c==="knob"&&u.classList.add("knob-centered");const g=document.createElement("label");g.htmlFor=e,g.textContent=a;const f=document.createElement("select");f.style.marginLeft=c==="knob"?"0":"auto",r.forEach(y=>{const b=document.createElement("option");b.value=y.value,b.textContent=y.label,y.value==="none"&&(b.selected=!0),f.appendChild(b)});const p=document.createElement("span");p.className="value-display",p.id=`${e}-value`;const m=y=>{p.textContent=y.toFixed(2)};m(s);const v=document.createElement("input");if(v.type="range",v.id=e,v.min=String(t),v.max=String(i),v.value=String(s),v.step=String(n),v.className="slider",v.addEventListener("input",()=>{const y=parseFloat(v.value);m(y),o(y)}),f.addEventListener("change",()=>{h(f.value),v.disabled=f.value!=="none",u.style.opacity=f.value!=="none"?"0.8":"1.0"}),c==="knob")v.style.display="none",u.appendChild(g),u.appendChild(f),u.appendChild(Pe(v)),u.appendChild(p);else{const y=document.createElement("div");y.className="label-row",y.appendChild(g),y.appendChild(f);const b=document.createElement("div");b.className="label-row",b.style.justifyContent="flex-end",b.appendChild(p),u.appendChild(y),u.appendChild(b),u.appendChild(v)}return d.appendChild(u),{slider:v,select:f}}function et(d,e,a,t,i=!1,s){const n=document.createElement("div");n.className="control-group";const r=document.createElement("label");r.htmlFor=e,r.textContent=a;const o=document.createElement("input");o.type="file",o.id=e,o.accept=t,o.multiple=i,o.className="file-input",s&&o.addEventListener("change",()=>s(o.files));const h=document.createElement("div");return h.className="label-row",h.appendChild(r),n.appendChild(h),n.appendChild(o),d.appendChild(n),o}function ce(d,e,a,t,i,s,n,r){const o=document.createElement("div");o.className="control-group-row",o.style.display="flex",o.style.alignItems="center",o.style.gap="8px",o.style.marginBottom="8px";const h=document.createElement("label");h.htmlFor=e,h.textContent=a,h.style.fontSize="12px",h.style.whiteSpace="nowrap",h.style.marginBottom="0";const c=document.createElement("input");return c.type="number",c.id=e,c.min=String(i),c.max=String(s),c.step=String(n),c.value=String(t),c.style.width="60px",c.style.background="var(--bg-input)",c.style.border="1px solid var(--border-subtle)",c.style.color="var(--text-main)",c.style.padding="2px 4px",c.style.borderRadius="4px",o.appendChild(h),o.appendChild(c),d.appendChild(o),c}class tt{constructor(e,a){l(this,"container");l(this,"pathYSlider");l(this,"planeTypeSelect");l(this,"scanPositionSlider");l(this,"synthModeSelect");l(this,"synthParamsContainer",null);l(this,"interpSamplesSlider");l(this,"midiSelect");l(this,"densityXSlider");l(this,"densityYSlider");l(this,"densityZSlider");l(this,"spectralDataSelect");l(this,"dynamicParamSlider",null);l(this,"dynamicParamContainer",null);l(this,"generatorParamsContainer",null);l(this,"currentGeneratorParams",null);l(this,"currentDataSet","blank");l(this,"progressContainer",null);l(this,"progressFill",null);l(this,"progressText",null);l(this,"onPathChange",null);l(this,"onVolumeResolutionChange");l(this,"onSpectralDataChange");l(this,"onWavUpload");l(this,"onSynthModeChange",null);l(this,"onCarrierChange",null);l(this,"onFeedbackChange",null);l(this,"onMidiInputChange",null);l(this,"onOctaveChange",null);l(this,"onOctaveDoublingChange",null);l(this,"onInterpSamplesChange",null);l(this,"onLFOParamChange",null);l(this,"onModulationRoutingChange",null);l(this,"onGeneratorParamsChange",null);l(this,"onRenderWav",null);l(this,"presetManager");l(this,"presetSelect",null);l(this,"onPresetLoad",null);l(this,"lfoLabels",["None"]);l(this,"lfoState",[]);l(this,"modRoutingState",{pathY:"none",scanPhase:"none",shapePhase:"none"});l(this,"octaveValue",3);l(this,"octaveDoublingState",{...$e});l(this,"octaveLowSlider");l(this,"octaveHighSlider");l(this,"octaveMultSlider");l(this,"autoSaveTimer",null);l(this,"lfoWaveSelects",[]);l(this,"lfoFreqSliders",[]);l(this,"lfoAmpSliders",[]);l(this,"lfoOffsetSliders",[]);l(this,"lfoFreqDisplays",[]);l(this,"lfoAmpDisplays",[]);l(this,"lfoOffsetDisplays",[]);l(this,"carrierIconContainer",null);l(this,"lfoIconContainers",[]);l(this,"pathYSourceSelect",null);l(this,"scanPhaseSourceSelect",null);l(this,"shapePhaseSourceSelect",null);l(this,"envelopeCanvas",null);const t=document.getElementById(e);if(!t)throw new Error(`Container not found: ${e}`);this.container=t,this.lfoState=a.lfos.map((s,n)=>{const r=`LFO ${n+1}`;return this.lfoLabels.push(r),{waveform:s.waveform,frequency:s.frequency,amplitude:s.amplitude,offset:s.offset}}),this.presetManager=new Qe,this.presetManager.setPresetsChangeCallback(()=>this.updatePresetDropdown()),[{title:"Wave/Spectral Volume",populate:s=>this.populateVolumeSection(s)},{title:"Audio Synthesis",populate:s=>this.populateSynthesisSection(s)},{title:"Reading Path",populate:s=>this.populatePathSection(s)},{title:"LFOs",populate:s=>this.populateLFOSection(s)},{title:"Visualization",populate:s=>this.populateVisualizationSection(s),mode:"slider"},{title:"Offline Render",populate:s=>this.populateOfflineRenderSection(s)}].forEach(s=>{const n=Je(this.container,s.title,s.mode);s.populate(n)}),this.updateModulationRanges()}populateVolumeSection(e){const a=document.createElement("div");a.classList.add("sub-group"),e.appendChild(a),this.spectralDataSelect=G(a,"spectral-data-type","Data Set",["blank","3d-julia","mandelbulb","menger-sponge","sine-plasma","game-of-life"],n=>{this.onSpectralDataChange&&this.onSpectralDataChange(n),this.scheduleAutoSave()}),this.createGeneratorParamsContainer(a),j(a,"reset-dataset-btn","↻ Reset Dataset",()=>{this.onSpectralDataChange&&this.onSpectralDataChange(this.spectralDataSelect.value)});const t=document.createElement("div");t.classList.add("sub-group"),e.appendChild(t),et(t,"wav-upload","Upload WAV (Multi-select)",".wav,.mp3,.ogg",!0,n=>{n&&n.length>0&&this.onWavUpload&&this.onWavUpload(n)}),this.createProgressIndicator(t),this.presetSelect=G(t,"preset-select","Load Preset",[],n=>{if(n&&this.onPresetLoad){const r=this.presetManager.getPreset(n);r&&this.onPresetLoad(r.controls)}});const i=document.createElement("option");i.value="",i.textContent="-- Select Preset --",this.presetSelect.insertBefore(i,this.presetSelect.firstChild),this.updatePresetDropdown();const s=document.createElement("div");s.className="control-group",s.style.display="flex",s.style.gap="8px",j(s,"save-preset-btn","💾 Save",()=>{const n=prompt("Enter preset name:");n&&n.trim()&&this.presetManager.savePreset(n.trim(),this.getFullState())}),j(s,"delete-preset-btn","🗑 Delete",()=>{this.presetSelect&&this.presetSelect.value&&confirm(`Delete preset "${this.presetSelect.value}"?`)&&this.presetManager.deletePreset(this.presetSelect.value)}),t.appendChild(s)}populatePathSection(e){const a=this.lfoLabels.map(r=>({value:r.toLowerCase().replace(" ",""),label:r})),t=document.createElement("div");t.className="control-group",e.appendChild(t),this.planeTypeSelect=G(t,"plane-type","Plane Type",[q.FLAT,q.SINCOS,q.WAVE,q.RIPPLE],r=>{this.onPathChange&&this.onPathChange(this.getState()),this.scheduleAutoSave()}),this.shapePhaseSourceSelect=G(t,"shape-phase-source","Shape Phase Source",a,r=>{this.modRoutingState.shapePhase=r,this.onModulationRoutingChange&&this.onModulationRoutingChange("shapePhase",r),this.scheduleAutoSave()});const i=document.createElement("div");i.className="control-group",e.appendChild(i);const s=he(i,"path-y","Position Y (Morph)",-1,1,0,.01,a,r=>{this.onPathChange&&this.onPathChange(this.getState()),this.scheduleAutoSave()},r=>{this.modRoutingState.pathY=r,this.onModulationRoutingChange&&this.onModulationRoutingChange("pathY",r),this.scheduleAutoSave(),this.updateModulationRanges()});this.pathYSlider=s.slider,this.pathYSourceSelect=s.select;const n=he(i,"scan-pos","Scan Phase",-1,1,0,.01,a,r=>{this.onPathChange&&this.onPathChange(this.getState()),this.scheduleAutoSave()},r=>{this.modRoutingState.scanPhase=r,this.onModulationRoutingChange&&this.onModulationRoutingChange("scanPhase",r),this.scheduleAutoSave(),this.updateModulationRanges()});this.scanPositionSlider=n.slider,this.scanPhaseSourceSelect=n.select}populateSynthesisSection(e){const a=document.createElement("div");a.classList.add("sub-group"),e.appendChild(a),this.synthModeSelect=G(a,"synth-mode","Mode",[T.WAVETABLE,T.SPECTRAL,T.SPECTRAL_CHIRP,T.WHITENOISE_BAND_Q_FILTER],r=>{const o=r;this.updateSynthModeUI(o),this.onSynthModeChange&&this.onSynthModeChange(o),this.scheduleAutoSave()}),this.createEnvelopeUI(a),this.midiSelect=this.createMidiSelect(a),this.createOctaveSelect(a),this.synthParamsContainer=document.createElement("div"),this.synthParamsContainer.id="synth-params-container",this.synthParamsContainer.classList.add("sub-group"),e.appendChild(this.synthParamsContainer);const t=document.createElement("div");t.classList.add("sub-group"),e.appendChild(t),this.interpSamplesSlider=_(t,"interp-samples","Interp Samples",16,1024,64,16,r=>{this.onInterpSamplesChange&&this.onInterpSamplesChange(r),this.scheduleAutoSave()});const i=document.createElement("div");i.classList.add("sub-group"),e.appendChild(i);const s=document.createElement("label");s.textContent="Octave Doubling",s.style.fontWeight="bold",s.style.marginBottom="8px",s.style.display="block",i.appendChild(s);const n=()=>{this.onOctaveDoublingChange&&this.onOctaveDoublingChange(this.octaveDoublingState),this.scheduleAutoSave()};this.octaveLowSlider=_(i,"octave-low","Low (octaves below)",0,10,0,1,r=>{this.octaveDoublingState.lowCount=r,n()}),this.octaveHighSlider=_(i,"octave-high","High (octaves above)",0,10,0,1,r=>{this.octaveDoublingState.highCount=r,n()}),this.octaveMultSlider=_(i,"octave-mult","Decay (per octave)",0,1,.5,.01,r=>{this.octaveDoublingState.multiplier=r,n()}),this.updateSynthModeUI(this.synthModeSelect.value)}updateSynthModeUI(e){this.synthParamsContainer&&(this.synthParamsContainer.innerHTML="",e===T.WAVETABLE&&(this.createCarrierSelect(this.synthParamsContainer),this.createFeedbackSlider(this.synthParamsContainer)))}populateLFOSection(e){this.lfoState.forEach((a,t)=>this.createLFOUnit(e,t))}populateVisualizationSection(e){const a=()=>{this.onVolumeResolutionChange&&this.onVolumeResolutionChange({x:Math.round(parseFloat(this.densityXSlider.value)),y:Math.round(parseFloat(this.densityYSlider.value)),z:Math.round(parseFloat(this.densityZSlider.value))}),this.scheduleAutoSave()};this.densityXSlider=_(e,"density-x","Freq Bins (X)",Ge,We,fe,1,a,"slider"),this.densityYSlider=_(e,"density-y","Morph Layers (Y)",Ye,je,ge,1,a,"slider"),this.densityZSlider=_(e,"density-z","Time Res (Z)",He,Xe,ve,1,a,"slider")}appendControl(e,a){e.appendChild(a)}populateOfflineRenderSection(e){const a=document.createElement("div");a.classList.add("sub-group"),a.style.display="flex",a.style.flexDirection="column",a.style.gap="8px",e.appendChild(a);const t=document.createElement("div");t.style.display="flex",t.style.alignItems="center",t.style.gap="12px",a.appendChild(t);const i=ce(t,"render-base-note","Base Note",48,0,127,1),s=ce(t,"render-duration","Duration (s)",2,.1,10,.1);j(a,"render-wav-btn","RENDER WAV",()=>{const n=parseInt(i.value),r=parseFloat(s.value);this.onRenderWav&&this.onRenderWav(n,r)},"reset-button")}setRenderWavCallback(e){this.onRenderWav=e}createLFOUnit(e,a){const t=document.createElement("div");t.className="lfo-unit",t.classList.add("knob-layout");const i=document.createElement("label");i.innerText=`LFO ${a+1}`,t.appendChild(i);const s=document.createElement("div");s.className="waveform-icon",s.innerHTML=B[this.lfoState[a].waveform]||B.sine,this.lfoIconContainers[a]=s;const n=G(t,`lfo-${a}-wave`,"Waveform",[{value:"sine",label:"Sine"},{value:"square",label:"Square"},{value:"saw",label:"Saw"},{value:"triangle",label:"Triangle"}],o=>{this.lfoState[a].waveform=o,this.onLFOParamChange&&this.onLFOParamChange(a,"waveform",o),s.innerHTML=B[o]||B.sine,this.scheduleAutoSave()}),r=t.querySelector(".label-row");r&&r.appendChild(s),this.lfoWaveSelects[a]=n,this.lfoFreqSliders[a]=_(t,`lfo-${a}-freq`,"Freq",0,1,this.lfoState[a].frequency,.01,o=>{this.lfoState[a].frequency=o,this.onLFOParamChange&&this.onLFOParamChange(a,"frequency",o),this.scheduleAutoSave()}),this.lfoAmpSliders[a]=_(t,`lfo-${a}-amp`,"Amp",0,1,this.lfoState[a].amplitude,.01,o=>{this.lfoState[a].amplitude=o,this.onLFOParamChange&&this.onLFOParamChange(a,"amplitude",o),this.scheduleAutoSave(),this.updateModulationRanges()}),this.lfoOffsetSliders[a]=_(t,`lfo-${a}-offset`,"Offset",-1,1,this.lfoState[a].offset,.01,o=>{this.lfoState[a].offset=o,this.onLFOParamChange&&this.onLFOParamChange(a,"offset",o),this.scheduleAutoSave(),this.updateModulationRanges()}),this.appendControl(e,t)}createEnvelopeUI(e){const a=document.createElement("div");a.className="control-group",a.style.height="150px";const t=document.createElement("canvas");t.id="envelope-canvas-control",t.style.width="100%",t.style.height="100%",t.style.display="block",t.style.background="#08080c",t.style.borderRadius="4px",t.style.border="1px solid var(--border-subtle)",a.appendChild(t),this.appendControl(e,a),this.envelopeCanvas=t}createCarrierSelect(e){const a=document.createElement("div");a.id="carrier-container",a.className="control-group";const t=document.createElement("label");t.htmlFor="carrier",t.textContent="Carrier";const i=document.createElement("div");i.className="waveform-icon",i.innerHTML=B.sine,this.carrierIconContainer=i;const s=G(a,"carrier","Carrier",[{value:"0",label:"Sine"},{value:"1",label:"Saw"},{value:"2",label:"Square"},{value:"3",label:"Triangle"}],r=>{const o=parseInt(r);this.onCarrierChange&&this.onCarrierChange(o);const h=["sine","saw","square","triangle"];i.innerHTML=B[h[o]]||B.sine}),n=a.querySelector(".label-row");return n&&n.appendChild(i),this.appendControl(e,a),s}createFeedbackSlider(e){const a=_(e,"feedback","Feedback",0,.99,0,.01,i=>{this.onFeedbackChange&&this.onFeedbackChange(i)}),t=a.closest(".control-group");return t&&(t.id="feedback-container"),a}createMidiSelect(e){return G(e,"midi-input","MIDI Input",[{value:"",label:"No Devices Found"}],t=>{this.onMidiInputChange&&this.onMidiInputChange(t)})}createOctaveSelect(e){const a=G(e,"octave-select","Keyboard Octave",["0","1","2","3","4","5","6","7"],t=>{this.octaveValue=parseInt(t,10),this.onOctaveChange&&this.onOctaveChange(this.octaveValue),this.scheduleAutoSave()});return a.value="3",a}updatePresetDropdown(){if(!this.presetSelect)return;const e=this.presetSelect.value;this.presetSelect.innerHTML="";const a=document.createElement("option");a.value="",a.textContent="-- Select Preset --",this.presetSelect.appendChild(a);const t=this.presetManager.getPresets();for(const i of t){const s=document.createElement("option");s.value=i.name,s.textContent=i.name,this.presetSelect.appendChild(s)}t.some(i=>i.name===e)&&(this.presetSelect.value=e)}scheduleAutoSave(){this.autoSaveTimer&&clearTimeout(this.autoSaveTimer),this.autoSaveTimer=window.setTimeout(()=>{this.presetManager.saveCurrentState(this.getFullState())},500)}getFullState(){return{pathY:parseFloat(this.pathYSlider.value),scanPosition:parseFloat(this.scanPositionSlider.value),planeType:this.planeTypeSelect.value,synthMode:this.synthModeSelect.value,frequency:220,carrier:parseInt(document.getElementById("carrier")?.value||"0"),feedback:parseFloat(document.getElementById("feedback")?.value||"0"),densityX:parseFloat(this.densityXSlider.value),densityY:parseFloat(this.densityYSlider.value),densityZ:parseFloat(this.densityZSlider.value),spectralData:this.spectralDataSelect.value,generatorParams:this.currentGeneratorParams||void 0,lfos:this.lfoState.map(e=>({...e})),modRouting:{...this.modRoutingState},envelopes:[{attack:.1,decay:.2,sustain:.5,release:.5}],octave:this.octaveValue,octaveDoubling:{...this.octaveDoublingState},interpSamples:parseFloat(this.interpSamplesSlider.value)}}setPresetLoadCallback(e){this.onPresetLoad=e}loadSavedState(){return this.presetManager.loadCurrentState()}applyState(e){this.pathYSlider.value=String(e.pathY),this.scanPositionSlider.value=String(e.scanPosition),this.planeTypeSelect.value=e.planeType,this.synthModeSelect.value=e.synthMode,this.densityXSlider.value=String(e.densityX),this.densityYSlider.value=String(e.densityY),this.densityZSlider.value=String(e.densityZ),this.spectralDataSelect.value=e.spectralData,this.interpSamplesSlider.value=String(e.interpSamples||64),this.updateSynthModeUI(e.synthMode);const a=document.getElementById("carrier");if(a&&(a.value=String(e.carrier),this.carrierIconContainer)){const n=[{value:"0",key:"sine"},{value:"1",key:"saw"},{value:"2",key:"square"},{value:"3",key:"triangle"}].find(r=>r.value===a.value)?.key||"sine";this.carrierIconContainer.innerHTML=B[n]}const t=document.getElementById("feedback");t&&(t.value=String(e.feedback));const i=document.getElementById("octave-select");i&&(i.value=String(e.octave),this.octaveValue=e.octave),e.lfos&&e.lfos.forEach((s,n)=>{this.lfoState[n]&&(this.lfoState[n]={...s},this.updateLFOUI(n,s))}),this.modRoutingState={...e.modRouting},this.updateModRoutingUI(),e.generatorParams&&(this.currentGeneratorParams=e.generatorParams),e.octaveDoubling&&(this.octaveDoublingState={...e.octaveDoubling},this.octaveLowSlider.value=String(e.octaveDoubling.lowCount),this.octaveHighSlider.value=String(e.octaveDoubling.highCount),this.octaveMultSlider.value=String(e.octaveDoubling.multiplier)),this.updateAllDisplays(),this.updateModulationRanges()}updateLFOUI(e,a){this.lfoWaveSelects[e]&&(this.lfoWaveSelects[e].value=a.waveform,this.lfoIconContainers[e]&&(this.lfoIconContainers[e].innerHTML=B[a.waveform]||B.sine)),this.lfoFreqSliders[e]&&(this.lfoFreqSliders[e].value=String(a.frequency),this.lfoFreqDisplays[e]&&(this.lfoFreqDisplays[e].textContent=`${a.frequency} Hz`)),this.lfoAmpSliders[e]&&(this.lfoAmpSliders[e].value=String(a.amplitude),this.lfoAmpDisplays[e]&&(this.lfoAmpDisplays[e].textContent=String(a.amplitude))),this.lfoOffsetSliders[e]&&(this.lfoOffsetSliders[e].value=String(a.offset),this.lfoOffsetDisplays[e]&&(this.lfoOffsetDisplays[e].textContent=String(a.offset)))}updateModRoutingUI(){this.pathYSourceSelect&&(this.pathYSourceSelect.value=this.modRoutingState.pathY,this.pathYSlider.disabled=this.modRoutingState.pathY!=="none"),this.scanPhaseSourceSelect&&(this.scanPhaseSourceSelect.value=this.modRoutingState.scanPhase,this.scanPositionSlider.disabled=this.modRoutingState.scanPhase!=="none"),this.shapePhaseSourceSelect&&(this.shapePhaseSourceSelect.value=this.modRoutingState.shapePhase),this.updateModulationRanges()}updateAllDisplays(){const e=document.getElementById("path-y-value");e&&(e.textContent=parseFloat(this.pathYSlider.value).toFixed(2));const a=document.getElementById("scan-pos-value");a&&(a.textContent=parseFloat(this.scanPositionSlider.value).toFixed(2));const t=document.getElementById("feedback-value"),i=document.getElementById("feedback");t&&i&&(t.textContent=Math.round(parseFloat(i.value)*100)+"%");const s=document.getElementById("density-x-value"),n=document.getElementById("density-y-value"),r=document.getElementById("density-z-value");s&&(s.textContent=String(Math.round(parseFloat(this.densityXSlider.value)))),n&&(n.textContent=String(Math.round(parseFloat(this.densityYSlider.value)))),r&&(r.textContent=String(Math.round(parseFloat(this.densityZSlider.value))))}updateModulationRanges(){const e=(a,t)=>{if(!a)return;const i=a;if(t==="none")i.hasModulation=!1;else{const s=parseInt(t.replace("lfo",""))-1,n=this.lfoState[s];n?(i.hasModulation=!0,i.modOffset=n.offset,i.modAmplitude=n.amplitude):i.hasModulation=!1}i.updateKnob&&i.updateKnob()};e(this.pathYSlider,this.modRoutingState.pathY),e(this.scanPositionSlider,this.modRoutingState.scanPhase)}createGeneratorParamsContainer(e){const a=document.createElement("div");a.id="generator-params-container",a.style.display="none",a.classList.add("lfo-unit"),this.appendControl(e,a),this.generatorParamsContainer=a}showGeneratorParams(e,a){if(!this.generatorParamsContainer)return;this.generatorParamsContainer.innerHTML="",this.currentDataSet=e;const t=()=>{this.onGeneratorParamsChange&&this.currentGeneratorParams&&this.onGeneratorParamsChange(this.currentDataSet,this.currentGeneratorParams)},i=(s,n,r,o,h,c)=>_(this.generatorParamsContainer,`gen-param-${s}`,s,n,r,o,h,c);switch(e){case"3d-julia":{const s={...a||Se};this.currentGeneratorParams=s,i("Scale",.5,2,s.scale,.1,n=>{s.scale=n,t()}),i("C Real",-1,1,s.cReal,.05,n=>{s.cReal=n,t()}),i("C Imaginary",-1,1,s.cImag,.05,n=>{s.cImag=n,t()});break}case"mandelbulb":{const s={...a||ye};this.currentGeneratorParams=s,i("Power",2,12,s.power,1,n=>{s.power=n,t()}),i("Scale",.5,2,s.scale,.1,n=>{s.scale=n,t()}),i("Iterations",4,20,s.iterations,1,n=>{s.iterations=n,t()});break}case"menger-sponge":{const s={...a||be};this.currentGeneratorParams=s,i("Iterations",1,5,s.iterations,1,n=>{s.iterations=n,t()}),i("Scale",.5,2,s.scale,.1,n=>{s.scale=n,t()}),i("Hole Size",.2,.5,s.holeSize,.01,n=>{s.holeSize=n,t()});break}case"sine-plasma":{const s={...a||J};this.currentGeneratorParams=s,i("Frequency",1,10,s.frequency,.5,n=>{s.frequency=n,t()}),i("Complexity",1,6,s.complexity,1,n=>{s.complexity=n,t()}),i("Contrast",.5,3,s.contrast,.1,n=>{s.contrast=n,t()});break}case"game-of-life":{const s={...a||ee};this.currentGeneratorParams=s,i("Density",.1,.5,s.density,.05,n=>{s.density=n,t()}),i("Birth Neighbors",4,6,s.birthMin,1,n=>{s.birthMin=n,t()}),i("Survive Neighbors",3,6,s.surviveMin,1,n=>{s.surviveMin=n,t()});break}default:this.currentGeneratorParams=null,this.generatorParamsContainer.style.display="none";return}this.generatorParamsContainer.style.display="block"}hideGeneratorParams(){this.generatorParamsContainer&&(this.generatorParamsContainer.style.display="none",this.generatorParamsContainer.innerHTML=""),this.currentGeneratorParams=null}createProgressIndicator(e){const a=document.createElement("div");a.id="wav-progress-container",a.className="progress-container",a.style.display="none";const t=document.createElement("div");t.className="spinner";const i=document.createElement("div");i.className="progress-bar";const s=document.createElement("div");s.id="wav-progress-fill",s.className="progress-fill";const n=document.createElement("span");n.id="wav-progress-text",n.className="progress-text",n.textContent="0%",i.appendChild(s),a.appendChild(t),a.appendChild(i),a.appendChild(n),this.appendControl(e,a),this.progressContainer=a,this.progressFill=s,this.progressText=n}showProgress(){this.progressContainer&&(this.progressContainer.style.display="flex")}hideProgress(){this.progressContainer&&(this.progressContainer.style.display="none")}updateProgress(e){this.progressFill&&(this.progressFill.style.width=`${e}%`),this.progressText&&(this.progressText.textContent=`${Math.round(e)}%`)}setPathChangeCallback(e){this.onPathChange=e}setSynthModeChangeCallback(e){this.onSynthModeChange=e}setInterpSamplesChangeCallback(e){this.onInterpSamplesChange=e}setCarrierChangeCallback(e){this.onCarrierChange=e}setFeedbackChangeCallback(e){this.onFeedbackChange=e}setMidiInputChangeCallback(e){this.onMidiInputChange=e}setOctaveChangeCallback(e){this.onOctaveChange=e}setOctaveDoublingChangeCallback(e){this.onOctaveDoublingChange=e}updateMidiInputs(e){const a=this.midiSelect.value;if(this.midiSelect.innerHTML="",e.length===0){const t=document.createElement("option");t.value="",t.textContent="No Devices Found",this.midiSelect.appendChild(t),this.midiSelect.disabled=!0}else{this.midiSelect.disabled=!1;for(const t of e){const i=document.createElement("option");i.value=t.id,i.textContent=t.name,this.midiSelect.appendChild(i)}e.some(t=>t.id===a)?this.midiSelect.value=a:e.length>0&&(this.midiSelect.selectedIndex=0,this.onMidiInputChange&&this.onMidiInputChange(this.midiSelect.value))}}setVolumeResolutionChangeCallback(e){this.onVolumeResolutionChange=e}setSpectralDataChangeCallback(e){this.onSpectralDataChange=e}setWavUploadCallback(e){this.onWavUpload=e}setLFOParamChangeCallback(e){this.onLFOParamChange=e}setModulationRoutingChangeCallback(e){this.onModulationRoutingChange=e}setGeneratorParamsChangeCallback(e){this.onGeneratorParamsChange=e}getCurrentGeneratorParams(){return this.currentGeneratorParams}updateGeneratorParamsUI(e,a){["3d-julia","mandelbulb","menger-sponge","sine-plasma","game-of-life"].includes(e)?this.showGeneratorParams(e,a):this.hideGeneratorParams()}showDynamicParam(e,a,t,i,s){if(!this.dynamicParamSlider||!this.dynamicParamContainer)return;const n=document.getElementById("dynamic-param-label"),r=document.getElementById("dynamic-param-value");n&&(n.textContent=e),this.dynamicParamSlider.min=String(a),this.dynamicParamSlider.max=String(t),this.dynamicParamSlider.value=String(i),this.dynamicParamSlider.step=String(s),r&&(r.textContent=s>=1?String(Math.round(i)):i.toFixed(2)),this.dynamicParamContainer.style.display="block"}hideDynamicParam(){this.dynamicParamContainer&&(this.dynamicParamContainer.style.display="none")}getState(){return{position:{x:0,y:parseFloat(this.pathYSlider.value),z:0},rotation:{x:0,y:0,z:0},scanPosition:parseFloat(this.scanPositionSlider.value),planeType:this.planeTypeSelect.value,shapePhase:0}}updateScanPosition(e){this.scanPositionSlider.value=String(e);const a=document.getElementById("scan-pos-value");a&&(a.textContent=e.toFixed(2)),this.onPathChange&&this.onPathChange(this.getState())}updatePathY(e){this.pathYSlider.value=String(e);const a=document.getElementById("path-y-value");a&&(a.textContent=e.toFixed(2)),this.onPathChange&&this.onPathChange(this.getState())}addSpectralDataOption(e,a){if(!Array.from(this.spectralDataSelect.options).find(s=>s.value===e)){const s=document.createElement("option");s.value=e,s.textContent=a,this.spectralDataSelect.appendChild(s)}this.spectralDataSelect.value=e;const i=new Event("change");this.spectralDataSelect.dispatchEvent(i)}setVolumeDensity(e){this.densityXSlider.value=String(e.x),this.densityYSlider.value=String(e.y),this.densityZSlider.value=String(e.z);const a=document.getElementById("density-x-value"),t=document.getElementById("density-y-value"),i=document.getElementById("density-z-value");a&&(a.textContent=String(Math.round(e.x))),t&&(t.textContent=String(Math.round(e.y))),i&&(i.textContent=String(Math.round(e.z)))}}class at{constructor(e){l(this,"canvas");l(this,"gl");l(this,"program");l(this,"texture");l(this,"vao");l(this,"titleElement",null);l(this,"width",320);l(this,"height",320);l(this,"dpr",1);l(this,"mode","AUDIO_OUTPUT");l(this,"writeIndex",0);l(this,"historyHeight",512);l(this,"textureWidth",2048);l(this,"vertexShaderSource",`#version 300 es
        layout(location = 0) in vec2 a_position;
        out vec2 v_uv;
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `);l(this,"fragmentShaderSource",`#version 300 es
        precision highp float;
        uniform sampler2D u_history;
        uniform float u_writeIndex;
        uniform float u_historyHeight;
        uniform float u_dataWidth;
        uniform float u_textureWidth;
        uniform int u_mode;
        in vec2 v_uv;
        out vec4 outColor;

        vec3 hsl2rgb(vec3 c) {
            vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
            return c.z + c.y * (rgb-0.5) * (1.0-abs(2.0*c.z-1.0));
        }

        void main() {
            // Roll coords: latest row at bottom (v_uv.y = 0)
            float y = mod(u_writeIndex - 1.0 - (v_uv.y * u_historyHeight), u_historyHeight);
            float normY = (y + 0.5) / u_historyHeight;

            float x = v_uv.x;
            if (u_mode == 0) {
                // Audio log scale
                float factor = 100.0;
                x = (pow(factor, x) - 1.0) / (factor - 1.0);
            }

            // Map [0..1] range to active portion of texture
            float normX = (x * u_dataWidth + 0.5) / u_textureWidth;
            float val = texture(u_history, vec2(normX, normY)).r;

            vec3 color;
            if (u_mode == 0) {
                float hue = v_uv.x * 0.85;
                float intensity = (val + 100.0) / 70.0;
                intensity = clamp(intensity, 0.0, 1.0);
                float lightness = 0.05 + intensity * 0.55;
                color = hsl2rgb(vec3(hue, 0.9, lightness));
            } else {
                float hue = 0.35 + val * 0.15;
                float lightness = 0.05 + val * 0.50;
                color = hsl2rgb(vec3(hue, 0.8, lightness));
            }

            outColor = vec4(color, 1.0);
        }
    `);this.canvas=document.getElementById(e);const a=this.canvas.getContext("webgl2",{preserveDrawingBuffer:!0,alpha:!1,antialias:!1});if(!a)throw new Error("WebGL2 not supported");this.gl=a;const t=this.canvas.closest(".vis-content");if(t){const i=t.closest(".vis-group");i&&(this.titleElement=i.querySelector(".vis-header"))}this.updateTitle(),this.program=this.createProgram(this.vertexShaderSource,this.fragmentShaderSource),this.initBuffers(),this.initTexture(),this.resize(),window.addEventListener("resize",()=>this.resize()),this.canvas.addEventListener("click",()=>{this.mode=this.mode==="SCANLINE"?"AUDIO_OUTPUT":"SCANLINE",this.updateTitle()})}createShader(e,a){const t=this.gl.createShader(e);if(this.gl.shaderSource(t,a),this.gl.compileShader(t),!this.gl.getShaderParameter(t,this.gl.COMPILE_STATUS))throw console.error("Shader error:",this.gl.getShaderInfoLog(t)),new Error("Shader compilation failed");return t}createProgram(e,a){const t=this.createShader(this.gl.VERTEX_SHADER,e),i=this.createShader(this.gl.FRAGMENT_SHADER,a),s=this.gl.createProgram();if(this.gl.attachShader(s,t),this.gl.attachShader(s,i),this.gl.linkProgram(s),!this.gl.getProgramParameter(s,this.gl.LINK_STATUS))throw console.error("Program error:",this.gl.getProgramInfoLog(s)),new Error("Program linking failed");return s}initBuffers(){const e=this.gl,a=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),t=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,t),e.bufferData(e.ARRAY_BUFFER,a,e.STATIC_DRAW),this.vao=e.createVertexArray(),e.bindVertexArray(this.vao),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null)}initTexture(){const e=this.gl;this.texture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this.texture),e.getExtension("EXT_color_buffer_float"),e.getExtension("OES_texture_float_linear"),e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texImage2D(e.TEXTURE_2D,0,e.R32F,this.textureWidth,this.historyHeight,0,e.RED,e.FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT)}updateTitle(){this.titleElement&&(this.titleElement.textContent=this.mode==="AUDIO_OUTPUT"?"Spectrogram":"ReadLine Output")}resize(){const e=this.canvas.clientWidth,a=this.canvas.clientWidth;this.dpr=window.devicePixelRatio||1,e!==0&&(this.canvas.width=e*this.dpr,this.canvas.height=a*this.dpr,this.width=e*this.dpr,this.height=a*this.dpr,this.gl.viewport(0,0,this.width,this.height))}update(e,a){if(!e)return;const t=this.gl;if(this.width===0&&(this.resize(),this.width===0))return;let i,s=!1;if(this.mode==="AUDIO_OUTPUT"&&a)i=a,s=!0;else{const r=e.length/4;i=new Float32Array(r);for(let o=0;o<r;o++)i[o]=e[o*4]}const n=Math.min(i.length,this.textureWidth);n!==0&&(t.bindTexture(t.TEXTURE_2D,this.texture),t.texSubImage2D(t.TEXTURE_2D,0,0,this.writeIndex,n,1,t.RED,t.FLOAT,i,0),this.writeIndex=(this.writeIndex+1)%this.historyHeight,t.clearColor(0,0,0,1),t.clear(t.COLOR_BUFFER_BIT),t.useProgram(this.program),t.bindVertexArray(this.vao),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.texture),t.uniform1i(t.getUniformLocation(this.program,"u_history"),0),t.uniform1f(t.getUniformLocation(this.program,"u_writeIndex"),this.writeIndex),t.uniform1f(t.getUniformLocation(this.program,"u_historyHeight"),this.historyHeight),t.uniform1f(t.getUniformLocation(this.program,"u_dataWidth"),n),t.uniform1f(t.getUniformLocation(this.program,"u_textureWidth"),this.textureWidth),t.uniform1i(t.getUniformLocation(this.program,"u_mode"),s?0:1),t.drawArrays(t.TRIANGLES,0,6))}}class st{constructor(e){l(this,"canvas");l(this,"gl");l(this,"program");l(this,"fadeProgram");l(this,"vao");l(this,"quadVAO");l(this,"vboL");l(this,"vboR");l(this,"titleElement",null);l(this,"width",320);l(this,"height",320);l(this,"dpr",1);l(this,"mode","channels");l(this,"vertexShaderSource",`#version 300 es
        layout(location = 0) in float a_sample;
        layout(location = 1) in float a_other_sample; 
        
        uniform int u_mode; 
        uniform float u_numSamples;
        
        void main() {
            float x, y;
            float index = float(gl_VertexID);
            
            if (u_mode == 0) {
                // Channels mode: Linear X mapping
                x = (index / (u_numSamples - 1.0)) * 2.0 - 1.0;
                y = a_sample * 0.8;
            } else {
                // Lissajous mode: X=L, Y=R
                x = a_sample * 0.8;
                y = -a_other_sample * 0.8;
            }
            
            gl_Position = vec4(x, y, 0.0, 1.0);
        }
    `);l(this,"fragmentShaderSource",`#version 300 es
        precision highp float;
        uniform vec4 u_color;
        out vec4 outColor;
        void main() {
            outColor = u_color;
        }
    `);l(this,"fadeVertexShaderSource",`#version 300 es
        layout(location = 0) in vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `);l(this,"fadeFragmentShaderSource",`#version 300 es
        precision highp float;
        uniform float u_alpha;
        out vec4 outColor;
        void main() {
            outColor = vec4(0.0, 0.0, 0.0, u_alpha);
        }
    `);this.canvas=document.getElementById(e);const a=this.canvas.getContext("webgl2",{antialias:!0,alpha:!1,preserveDrawingBuffer:!0});if(!a)throw new Error("WebGL2 not supported");this.gl=a;const t=this.canvas.closest(".vis-content");if(t){const i=t.closest(".vis-group");i&&(this.titleElement=i.querySelector(".vis-header"))}this.updateTitle(),this.program=this.createProgram(this.vertexShaderSource,this.fragmentShaderSource),this.fadeProgram=this.createProgram(this.fadeVertexShaderSource,this.fadeFragmentShaderSource),this.initBuffers(),this.resize(),window.addEventListener("resize",()=>this.resize()),this.canvas.addEventListener("click",()=>{this.mode=this.mode==="lissajous"?"channels":"lissajous",this.updateTitle()})}createShader(e,a){const t=this.gl.createShader(e);if(this.gl.shaderSource(t,a),this.gl.compileShader(t),!this.gl.getShaderParameter(t,this.gl.COMPILE_STATUS))throw console.error("Shader compile error:",this.gl.getShaderInfoLog(t)),new Error("Shader compilation failed");return t}createProgram(e,a){const t=this.createShader(this.gl.VERTEX_SHADER,e),i=this.createShader(this.gl.FRAGMENT_SHADER,a),s=this.gl.createProgram();if(this.gl.attachShader(s,t),this.gl.attachShader(s,i),this.gl.linkProgram(s),!this.gl.getProgramParameter(s,this.gl.LINK_STATUS))throw console.error("Program link error:",this.gl.getProgramInfoLog(s)),new Error("Program linking failed");return s}initBuffers(){const e=this.gl;this.vboL=e.createBuffer(),this.vboR=e.createBuffer(),this.vao=e.createVertexArray();const a=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),t=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,t),e.bufferData(e.ARRAY_BUFFER,a,e.STATIC_DRAW),this.quadVAO=e.createVertexArray(),e.bindVertexArray(this.quadVAO),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null)}updateTitle(){this.titleElement&&(this.titleElement.textContent=this.mode==="lissajous"?"Vectorscope":"Stereo Scope")}resize(){const e=this.canvas.clientWidth,a=this.canvas.clientWidth;this.dpr=window.devicePixelRatio||1,e!==0&&(this.canvas.width=e*this.dpr,this.canvas.height=a*this.dpr,this.width=e*this.dpr,this.height=a*this.dpr,this.gl.viewport(0,0,this.width,this.height),this.gl.clearColor(0,0,0,1),this.gl.clear(this.gl.COLOR_BUFFER_BIT))}draw(e,a){if(this.width===0&&(this.resize(),this.width===0))return;const t=this.gl,i=e.length;t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE_MINUS_SRC_ALPHA),t.useProgram(this.fadeProgram),t.bindVertexArray(this.quadVAO),t.uniform1f(t.getUniformLocation(this.fadeProgram,"u_alpha"),.2),t.drawArrays(t.TRIANGLES,0,6),t.useProgram(this.program),t.bindVertexArray(this.vao);const s=t.getUniformLocation(this.program,"u_mode"),n=t.getUniformLocation(this.program,"u_color"),r=t.getUniformLocation(this.program,"u_numSamples");t.uniform1f(r,i),this.mode==="channels"?(t.uniform1i(s,0),t.bindBuffer(t.ARRAY_BUFFER,this.vboL),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,1,t.FLOAT,!1,0,0),t.disableVertexAttribArray(1),t.uniform4f(n,.6,.6,.6,1),t.drawArrays(t.LINE_STRIP,0,i),t.bindBuffer(t.ARRAY_BUFFER,this.vboR),t.bufferData(t.ARRAY_BUFFER,a,t.DYNAMIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,1,t.FLOAT,!1,0,0),t.uniform4f(n,1,.3,.3,1),t.drawArrays(t.LINE_STRIP,0,i)):(t.uniform1i(s,1),t.bindBuffer(t.ARRAY_BUFFER,this.vboL),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,1,t.FLOAT,!1,0,0),t.bindBuffer(t.ARRAY_BUFFER,this.vboR),t.bufferData(t.ARRAY_BUFFER,a,t.DYNAMIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,1,t.FLOAT,!1,0,0),t.uniform4f(n,0,1,.6,1),t.drawArrays(t.LINE_STRIP,0,i)),t.disable(t.BLEND),t.bindVertexArray(null)}}const ue=`
// Chirp Z-Transform (CZT) based additive synthesis
// Key insight: CZT uses jk = (j² + k² - (k-j)²)/2 identity for O(n log n) via convolution
// ICZT enables logarithmic frequency spacing matching human pitch perception

// FFT implementation for AudioWorklet (Cooley-Tukey radix-2)
function fft(real, imag, inverse) {
    const n = real.length;
    if (n <= 1) return;
    
    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tr = real[i]; real[i] = real[j]; real[j] = tr;
            let ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
        }
        let k = n >> 1;
        while (k <= j) { j -= k; k >>= 1; }
        j += k;
    }
    
    // Cooley-Tukey butterflies
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = sign * Math.PI / halfLen;
        const wReal = Math.cos(angle);
        const wImag = Math.sin(angle);
        
        for (let i = 0; i < n; i += len) {
            let curReal = 1, curImag = 0;
            for (let k = 0; k < halfLen; k++) {
                const evenIdx = i + k;
                const oddIdx = i + k + halfLen;
                
                const tr = curReal * real[oddIdx] - curImag * imag[oddIdx];
                const ti = curReal * imag[oddIdx] + curImag * real[oddIdx];
                
                real[oddIdx] = real[evenIdx] - tr;
                imag[oddIdx] = imag[evenIdx] - ti;
                real[evenIdx] += tr;
                imag[evenIdx] += ti;
                
                const nextReal = curReal * wReal - curImag * wImag;
                curImag = curReal * wImag + curImag * wReal;
                curReal = nextReal;
            }
        }
    }
    
    if (inverse) {
        for (let i = 0; i < n; i++) {
            real[i] /= n;
            imag[i] /= n;
        }
    }
}

// Compute CZT using Bluestein's algorithm
// X(z_k) = sum_n x[n] * A^(-n) * W^(nk) for k = 0..M-1
// A and W define the spiral contour in complex plane
function czt(xReal, xImag, M, aReal, aImag, wReal, wImag) {
    const N = xReal.length;
    
    // Compute chirp sequence: W^(n²/2)
    const chirpReal = new Float32Array(N);
    const chirpImag = new Float32Array(N);
    for (let n = 0; n < N; n++) {
        const angle = -Math.PI * n * n / N;  // W^(n²/2) for W = e^(-i*2π/N)
        chirpReal[n] = Math.cos(angle);
        chirpImag[n] = Math.sin(angle);
    }
    
    // y[n] = x[n] * A^(-n) * chirp[n]
    const yReal = new Float32Array(N);
    const yImag = new Float32Array(N);
    
    let aInvReal = aReal, aInvImag = -aImag;  // A^(-1)
    let aPowReal = 1, aPowImag = 0;  // A^(-n), start at n=0
    
    for (let n = 0; n < N; n++) {
        // x[n] * A^(-n)
        const xaReal = xReal[n] * aPowReal - xImag[n] * aPowImag;
        const xaImag = xReal[n] * aPowImag + xImag[n] * aPowReal;
        
        // * chirp[n]
        yReal[n] = xaReal * chirpReal[n] - xaImag * chirpImag[n];
        yImag[n] = xaReal * chirpImag[n] + xaImag * chirpReal[n];
        
        // Update A^(-n) -> A^(-(n+1))
        const nextReal = aPowReal * aInvReal - aPowImag * aInvImag;
        aPowImag = aPowReal * aInvImag + aPowImag * aInvReal;
        aPowReal = nextReal;
    }
    
    // Convolve with conjugate chirp
    // This is the Bluestein trick: convolution via FFT
    const L = 1 << Math.ceil(Math.log2(N + M - 1));  // Next power of 2
    
    // Pad y
    const yPadReal = new Float32Array(L);
    const yPadImag = new Float32Array(L);
    for (let i = 0; i < N; i++) {
        yPadReal[i] = yReal[i];
        yPadImag[i] = yImag[i];
    }
    
    // Conjugate chirp filter: chirp^(-n²/2) for convolution
    const hReal = new Float32Array(L);
    const hImag = new Float32Array(L);
    for (let n = 0; n < M; n++) {
        const angle = Math.PI * n * n / N;
        hReal[n] = Math.cos(angle);
        hImag[n] = Math.sin(angle);
    }
    // Wrap for circular convolution
    for (let n = 1; n < N; n++) {
        const angle = Math.PI * n * n / N;
        hReal[L - n] = Math.cos(angle);
        hImag[L - n] = Math.sin(angle);
    }
    
    // FFT both
    fft(yPadReal, yPadImag, false);
    fft(hReal, hImag, false);
    
    // Multiply in frequency domain
    for (let i = 0; i < L; i++) {
        const re = yPadReal[i] * hReal[i] - yPadImag[i] * hImag[i];
        const im = yPadReal[i] * hImag[i] + yPadImag[i] * hReal[i];
        yPadReal[i] = re;
        yPadImag[i] = im;
    }
    
    // IFFT
    fft(yPadReal, yPadImag, true);
    
    // Extract and apply final chirp
    const outReal = new Float32Array(M);
    const outImag = new Float32Array(M);
    for (let k = 0; k < M; k++) {
        const angle = -Math.PI * k * k / N;
        const cReal = Math.cos(angle);
        const cImag = Math.sin(angle);
        outReal[k] = yPadReal[k] * cReal - yPadImag[k] * cImag;
        outImag[k] = yPadReal[k] * cImag + yPadImag[k] * cReal;
    }
    
    return { real: outReal, imag: outImag };
}

// Inverse CZT via Bluestein approach
// Given spectrum X at logarithmically-spaced frequencies, reconstruct time-domain signal
function iczt(specReal, specImag, N, aReal, aImag, wReal, wImag) {
    const M = specReal.length;
    
    // For ICZT, we essentially solve X = CZT(x) for x
    // Using the Gohberg-Semencul formula for Vandermonde inversion
    // Simplified: ICZT(X) ≈ CZT(X) with conjugate parameters and scaling
    
    // Apply inverse chirp z-transform using conjugate spiral
    const wConjReal = wReal;
    const wConjImag = -wImag;
    const aConjReal = aReal;
    const aConjImag = -aImag;
    
    // Use CZT with conjugate parameters
    const result = czt(specReal, specImag, N, aConjReal, aConjImag, wConjReal, wConjImag);
    
    // Scale by 1/M
    for (let i = 0; i < N; i++) {
        result.real[i] /= M;
        result.imag[i] /= M;
    }
    
    return result;
}

// Block processing constants
const BLOCK_SIZE = 512;
const HOP_SIZE = 128;  // Matches AudioWorklet quantum
const OVERLAP_FACTOR = BLOCK_SIZE / HOP_SIZE;

// Hann window for smooth overlap-add
function createHannWindow(size) {
    const w = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / size));
    }
    return w;
}

class ChirpSpectralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Spectral data: [mag, phase, pan, custom] per bin
        this.numBins = 256;  // Logarithmically spaced bins
        this.spectralData = new Float32Array(this.numBins * 4);
        this.prevData = new Float32Array(this.numBins * 4);
        this.targetData = new Float32Array(this.numBins * 4);
        
        // Output buffer for overlap-add
        this.outputBuffer = new Float32Array(BLOCK_SIZE * 2);
        this.outputPhase = 0;
        this.window = createHannWindow(BLOCK_SIZE);
        
        // Phase accumulators for continuous synthesis
        this.phases = new Float32Array(this.numBins);
        
        // Interpolation
        this.interpSamples = 64;
        this.interpT = 1.0;
        this.interpStep = 1.0 / (this.interpSamples + 1);
        
        this.frequencyMultiplier = 1.0;
        
        // Octave doubling
        this.octaveLow = 0;
        this.octaveHigh = 0;
        this.octaveMult = 0.5;
        
        // Chirp spiral parameters for log frequency spacing
        // f_k = f_min * (f_max/f_min)^(k/(M-1)) for k = 0..M-1
        // This maps to W = e^(i * 2π * log(fmax/fmin) / (M * sr))
        this.fMin = 20;
        this.fMax = 20000;
        
        // Timeline for offline rendering
        this.timeline = null;
        this.timelineFrameSize = 0;
        this.timelineNumFrames = 0;
        this.timelineTotalSamples = 0;
        this.sampleCount = 0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-timeline') {
                this.timeline = e.data.frames;
                this.timelineFrameSize = e.data.frameSize;
                this.timelineNumFrames = e.data.numFrames;
                this.timelineTotalSamples = e.data.totalSamples;
                this.sampleCount = 0;
                this.numBins = this.timelineFrameSize / 4;
                for (let i = 0; i < this.timelineFrameSize; i++) {
                    this.spectralData[i] = this.timeline[i];
                }
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                this.numBins = data.length / 4;
                
                if (this.interpSamples === 0) {
                    this.spectralData.set(data);
                    this.targetData.set(data);
                    this.port.postMessage({ type: 'ready' });
                } else {
                    this.prevData.set(this.spectralData);
                    this.targetData.set(data);
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency-multiplier') {
                this.frequencyMultiplier = e.data.value;
            } else if (e.data.type === 'octave-doubling') {
                this.octaveLow = e.data.low;
                this.octaveHigh = e.data.high;
                this.octaveMult = e.data.multiplier;
            } else if (e.data.type === 'interp-samples') {
                this.interpSamples = e.data.value;
                this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
            }
        };
    }
    
    // Get logarithmically spaced frequency for bin k
    getLogFreq(k) {
        const ratio = this.fMax / this.fMin;
        return this.fMin * Math.pow(ratio, k / (this.numBins - 1)) * this.frequencyMultiplier;
    }
    
    // Synthesize a block using chirp-based approach
    synthesizeBlock() {
        const blockReal = new Float32Array(BLOCK_SIZE);
        const blockImag = new Float32Array(BLOCK_SIZE);
        const blockL = new Float32Array(BLOCK_SIZE);
        const blockR = new Float32Array(BLOCK_SIZE);
        
        const nyquist = sampleRate * 0.5;
        const pi2 = 2 * Math.PI;
        const pi2Sr = pi2 / sampleRate;
        
        // Build spectral representation in chirp domain
        // For each bin, compute phase-coherent contribution
        for (let bin = 0; bin < this.numBins; bin++) {
            const idx = bin * 4;
            const mag = this.spectralData[idx];
            const phaseOffset = this.spectralData[idx + 1];
            const pan = this.spectralData[idx + 2];
            
            if (mag < 0.001) continue;
            
            const freq = this.getLogFreq(bin);
            if (freq >= nyquist) continue;
            
            // Convert magnitude to linear amplitude
            const db = mag * 60 - 60;
            const amp = Math.pow(10, db / 20);
            
            // Pan law (constant power)
            const panVal = (pan - 0.5) * 2;
            const gainL = Math.min(1, 1 - panVal) * amp;
            const gainR = Math.min(1, 1 + panVal) * amp;
            
            // Phase increment per sample
            const phaseInc = freq * pi2Sr;
            
            // Synthesize this bin's contribution
            let phase = this.phases[bin];
            for (let s = 0; s < BLOCK_SIZE; s++) {
                const sample = Math.sin(phase + phaseOffset * pi2);
                blockL[s] += sample * gainL;
                blockR[s] += sample * gainR;
                
                phase += phaseInc;
                if (phase > pi2) phase -= pi2;
            }
            this.phases[bin] = phase;
            
            // Octave doubling (sub-harmonics)
            let harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveLow; h++) {
                const harmFreq = freq / Math.pow(2, h);
                if (harmFreq < 20) break;
                
                const harmPhaseInc = harmFreq * pi2Sr;
                let harmPhase = this.phases[bin] / Math.pow(2, h);  // Derive from base
                
                for (let s = 0; s < BLOCK_SIZE; s++) {
                    const sample = Math.sin(harmPhase + phaseOffset * pi2);
                    blockL[s] += sample * gainL * harmGain;
                    blockR[s] += sample * gainR * harmGain;
                    harmPhase += harmPhaseInc;
                }
                harmGain *= this.octaveMult;
            }
            
            // Octave doubling (harmonics)
            harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveHigh; h++) {
                const harmFreq = freq * Math.pow(2, h);
                if (harmFreq >= nyquist) break;
                
                const harmPhaseInc = harmFreq * pi2Sr;
                let harmPhase = this.phases[bin] * Math.pow(2, h);
                
                for (let s = 0; s < BLOCK_SIZE; s++) {
                    const sample = Math.sin(harmPhase + phaseOffset * pi2);
                    blockL[s] += sample * gainL * harmGain;
                    blockR[s] += sample * gainR * harmGain;
                    harmPhase += harmPhaseInc;
                }
                harmGain *= this.octaveMult;
            }
        }
        
        return { left: blockL, right: blockR };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        for (let i = 0; i < channelL.length; i++) {
            // Timeline mode interpolation
            if (this.timeline && this.timelineNumFrames > 1) {
                const progress = this.sampleCount / this.timelineTotalSamples;
                const framePos = progress * (this.timelineNumFrames - 1);
                const frame0 = Math.floor(framePos);
                const frame1 = Math.min(frame0 + 1, this.timelineNumFrames - 1);
                const t = framePos - frame0;
                const offset0 = frame0 * this.timelineFrameSize;
                const offset1 = frame1 * this.timelineFrameSize;
                for (let j = 0; j < this.timelineFrameSize; j++) {
                    this.spectralData[j] = this.timeline[offset0 + j] * (1 - t) + this.timeline[offset1 + j] * t;
                }
                this.sampleCount++;
            }
            // Per-sample interpolation
            else if (this.interpSamples > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;
                const t = this.interpT;
                const invT = 1.0 - t;
                for (let j = 0; j < this.spectralData.length; j++) {
                    this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
                }
            }
        }
        
        // Synthesize using chirp-based logarithmic frequency spacing
        const block = this.synthesizeBlock();
        
        // Output (simplified - taking first HOP_SIZE samples)
        // Full overlap-add would require buffering across process() calls
        const scale = 0.1;
        for (let i = 0; i < channelL.length; i++) {
            channelL[i] = block.left[i] * scale;
            channelR[i] = block.right[i] * scale;
        }
        
        return true;
    }
}
registerProcessor('chirp-spectral-processor', ChirpSpectralProcessor);
`,de=`
// Band-limiting constants
const NYQUIST_LIMIT = 0.45;  // 0.45 = 45% of Nyquist (conservative margin)
const ROLLOFF_MODE = 2;       // 0=hard, 1=smoothstep, 2=cosine, 3=hann

// Rolloff functions: t in [0,1], returns attenuation factor [0,1]
// t=0 means at limit edge (full signal), t=1 means at Nyquist (zero signal)
function rolloffHard(t) {
    return t < 0.001 ? 1.0 : 0.0;
}
function rolloffSmoothstep(t) {
    const x = 1.0 - t;
    return x * x * (3.0 - 2.0 * x);
}
function rolloffCosine(t) {
    return 0.5 * (1.0 + Math.cos(t * Math.PI));
}
function rolloffHann(t) {
    return 0.5 * (1.0 - Math.cos((1.0 - t) * Math.PI));
}

function computeRolloff(normalizedFreq, mode) {
    // normalizedFreq = freq / nyquist, range [0, 1+]
    if (normalizedFreq <= NYQUIST_LIMIT) return 1.0;
    if (normalizedFreq >= 1.0) return 0.0;
    
    // t: 0 at limit, 1 at nyquist
    const t = (normalizedFreq - NYQUIST_LIMIT) / (1.0 - NYQUIST_LIMIT);
    
    switch (mode) {
        case 0: return rolloffHard(t);
        case 1: return rolloffSmoothstep(t);
        case 2: return rolloffCosine(t);
        case 3: return rolloffHann(t);
        default: return rolloffSmoothstep(t);
    }
}

// Default interpolation samples (can be changed dynamically)
const DEFAULT_INTERP_SAMPLES = 64;

class SpectralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Interpolation setting
        this.interpSamples = DEFAULT_INTERP_SAMPLES;
        
        // Current working spectral data (interpolated)
        this.spectralData = new Float32Array(1024 * 4);
        // Previous frame (start of interpolation)
        this.prevData = new Float32Array(1024 * 4);
        // Target frame (end of interpolation)  
        this.targetData = new Float32Array(1024 * 4);
        
        // Phase accumulator per bin - runs continuously, never reset
        this.phaseAccumulators = new Float32Array(1024);
        
        // Per-bin phase offset targets (from spectral data)
        // We interpolate toward these to avoid discontinuities
        this.prevPhaseOffsets = new Float32Array(1024);
        this.targetPhaseOffsets = new Float32Array(1024);
        this.currentPhaseOffsets = new Float32Array(1024);
        
        this.frequencyMultiplier = 1.0;
        
        // Octave Doubling: layering octaves
        this.octaveLow = 0;      // 0-10 octaves below
        this.octaveHigh = 0;     // 0-10 octaves above
        this.octaveMult = 0.5;   // Volume decay per octave
        
        // Extra phase accumulators for octave doubling (10 low + 10 high per bin)
        this.harmonicPhases = new Float32Array(1024 * 20); // This will be resized based on numPoints
        
        // Interpolation state: 0 = at prev, 1 = at target
        this.interpT = 1.0;
        // Recalculate step based on current interpSamples
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
        
        // Timeline mode for offline rendering (LFO simulation)
        this.timeline = null;
        this.timelineFrameSize = 0;
        this.timelineNumFrames = 0;
        this.timelineTotalSamples = 0;
        this.sampleCount = 0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-timeline') {
                // Timeline of spectral frames for offline rendering
                this.timeline = e.data.frames;
                this.timelineFrameSize = e.data.frameSize;
                this.timelineNumFrames = e.data.numFrames;
                this.timelineTotalSamples = e.data.totalSamples;
                this.sampleCount = 0;
                // Initialize with first frame
                const numPoints = this.timelineFrameSize / 4;
                if (this.harmonicPhases.length !== numPoints * 20) {
                    this.harmonicPhases = new Float32Array(numPoints * 20);
                }
                for (let i = 0; i < this.timelineFrameSize; i++) {
                    this.spectralData[i] = this.timeline[i];
                }
                for (let bin = 0; bin < numPoints; bin++) {
                    this.currentPhaseOffsets[bin] = this.timeline[bin * 4 + 1];
                }
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                const numPoints = data.length / 4;
                
                // Resize harmonicPhases if numPoints changed
                if (this.harmonicPhases.length !== numPoints * 20) {
                    this.harmonicPhases = new Float32Array(numPoints * 20);
                }

                if (this.interpSamples === 0) {
                    // No interpolation - instant update
                    this.spectralData.set(data);
                    this.targetData.set(data);
                    // Extract phase offsets
                    for (let bin = 0; bin < numPoints; bin++) {
                        const offset = data[bin * 4 + 1];
                        this.currentPhaseOffsets[bin] = offset;
                        this.targetPhaseOffsets[bin] = offset;
                    }
                    // Acknowledge data received for offline rendering sync
                    this.port.postMessage({ type: 'ready' });
                } else {
                    // Snapshot current state as previous
                    this.prevData.set(this.spectralData);
                    this.prevPhaseOffsets.set(this.currentPhaseOffsets);
                    
                    // New incoming data is target
                    this.targetData.set(data);
                    for (let bin = 0; bin < numPoints; bin++) {
                        this.targetPhaseOffsets[bin] = data[bin * 4 + 1];
                    }
                    
                    // Reset interpolation
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency-multiplier') {
                this.frequencyMultiplier = e.data.value;
            } else if (e.data.type === 'octave-doubling') {
                this.octaveLow = e.data.low;
                this.octaveHigh = e.data.high;
                this.octaveMult = e.data.multiplier;
            } else if (e.data.type === 'interp-samples') {
                this.interpSamples = e.data.value;
                this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        const numPoints = this.spectralData.length / 4;
        const nyquist = sampleRate * 0.5;
        const PI2_SR = (2 * Math.PI) / sampleRate;
        const PI2 = 2 * Math.PI;
        
        for (let i = 0; i < channelL.length; i++) {
            // Timeline mode: step through pre-computed frames
            if (this.timeline && this.timelineNumFrames > 1) {
                const progress = this.sampleCount / this.timelineTotalSamples;
                const framePos = progress * (this.timelineNumFrames - 1);
                const frame0 = Math.floor(framePos);
                const frame1 = Math.min(frame0 + 1, this.timelineNumFrames - 1);
                const t = framePos - frame0;
                const offset0 = frame0 * this.timelineFrameSize;
                const offset1 = frame1 * this.timelineFrameSize;
                for (let j = 0; j < this.timelineFrameSize; j++) {
                    this.spectralData[j] = this.timeline[offset0 + j] * (1 - t) + this.timeline[offset1 + j] * t;
                }
                const np = this.timelineFrameSize / 4;
                for (let bin = 0; bin < np; bin++) {
                    this.currentPhaseOffsets[bin] = this.spectralData[bin * 4 + 1];
                }
                this.sampleCount++;
            }
            // Per-sample interpolation advance (skip if disabled)
            else if (this.interpSamples > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;
                
                const t = this.interpT;
                const invT = 1.0 - t;
                
                // Lerp all spectral data values (mag, custom1, custom2 - not phase offset)
                for (let j = 0; j < this.spectralData.length; j++) {
                    this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
                }
                
                // Lerp phase offsets separately for phase continuity
                for (let bin = 0; bin < numPoints; bin++) {
                    this.currentPhaseOffsets[bin] = 
                        this.prevPhaseOffsets[bin] * invT + this.targetPhaseOffsets[bin] * t;
                }
            }
            
            let sumL = 0;
            let sumR = 0;
            
            for (let bin = 0; bin < numPoints; bin++) {
                const idx = bin * 4;
                const mag = this.spectralData[idx];
                // Phase offset is now read from interpolated array, not spectralData
                const phaseOffset = this.currentPhaseOffsets[bin];
                const custom1 = this.spectralData[idx + 2];
                
                if (mag < 0.001) continue;

                const minFreq = 20;
                const maxFreq = 20000;
                const normalizedBin = bin / numPoints;
                const baseFreq = minFreq + (maxFreq - minFreq) * normalizedBin;
                const freq = baseFreq * this.frequencyMultiplier;
                
                // Band-limiting: skip or attenuate bins above Nyquist threshold
                const normalizedFreq = freq / nyquist;
                if (normalizedFreq >= 1.0) continue;  // Hard cutoff at Nyquist
                
                const rolloffGain = computeRolloff(normalizedFreq, ROLLOFF_MODE);
                if (rolloffGain < 0.001) continue;  // Skip negligible contributions
                
                const db = mag * 60 - 60;
                const linearMag = Math.pow(10, db / 20) * rolloffGain;
                
                const p = (custom1 - 0.5) * 2;
                const baseGainL = Math.min(1, 1 - p) * linearMag;
                const baseGainR = Math.min(1, 1 + p) * linearMag;
                
                // Helper to generate oscillator at given frequency with gain
                const generateOsc = (oscFreq, gain, phaseIdx) => {
                    if (gain < 0.001) return;
                    const nf = oscFreq / nyquist;
                    if (nf >= 1.0) return;
                    const rf = computeRolloff(nf, ROLLOFF_MODE);
                    if (rf < 0.001) return;
                    
                    this.harmonicPhases[phaseIdx] += (oscFreq * PI2_SR);
                    if (this.harmonicPhases[phaseIdx] > PI2) {
                        this.harmonicPhases[phaseIdx] -= PI2;
                    }
                    const sample = Math.sin(this.harmonicPhases[phaseIdx] + phaseOffset * PI2);
                    sumL += sample * baseGainL * gain * rf;
                    sumR += sample * baseGainR * gain * rf;
                };
                
                // Base oscillator (fundamental)
                this.phaseAccumulators[bin] += (freq * PI2_SR);
                if (this.phaseAccumulators[bin] > PI2) {
                    this.phaseAccumulators[bin] -= PI2;
                }
                const currentPhase = this.phaseAccumulators[bin] + (phaseOffset * PI2);
                const sample = Math.sin(currentPhase);
                sumL += sample * baseGainL;
                sumR += sample * baseGainR;
                
                // Low octaves (doubling below)
                let harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveLow; h++) {
                    const harmFreq = freq / Math.pow(2, h);
                    if (harmFreq < 20) break;
                    const phaseIdx = bin * 20 + (h - 1);
                    generateOsc(harmFreq, harmGain, phaseIdx);
                    harmGain *= this.octaveMult;
                }
                
                // High octaves (doubling above)
                harmGain = this.octaveMult;
                for (let h = 1; h <= this.octaveHigh; h++) {
                    const harmFreq = freq * Math.pow(2, h);
                    const phaseIdx = bin * 20 + 10 + (h - 1);
                    generateOsc(harmFreq, harmGain, phaseIdx);
                    harmGain *= this.octaveMult;
                }
            }
            
            const scale = 0.1; 
            channelL[i] = sumL * scale;
            channelR[i] = sumR * scale;
        }
        
        return true;
    }
}
registerProcessor('spectral-processor', SpectralProcessor);
`,pe=`
const DEFAULT_INTERP_SAMPLES = 128;

class WavetableProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Interpolation setting
        this.interpSamples = DEFAULT_INTERP_SAMPLES;
        
        this.envelope = new Float32Array(1024);     // Current interpolated envelope
        this.prevEnvelope = new Float32Array(1024); // Previous envelope
        this.targetEnvelope = new Float32Array(1024); // Target envelope
        this.envelopeSize = 64;
        this.phase = 0;           // Carrier phase (0-1)
        this.envPhase = 0;        // Envelope read position (0-1)
        this.frequency = 220;     // Carrier frequency Hz
        this.carrierType = 0;     // 0=sine, 1=saw, 2=square, 3=triangle
        this.feedback = 0;        // Feedback amount 0-1
        this.lastSample = 0;      // Previous output for feedback
        
        // Octave Doubling: octave layering
        this.octaveLow = 0;    // 0-10 octaves below
        this.octaveHigh = 0;   // 0-10 octaves above
        this.octaveMult = 0.5; // Volume decay per octave
        
        // Octave doubling phases (10 low + 10 high)
        this.harmonicPhases = new Float32Array(20);
        this.harmonicEnvPhases = new Float32Array(20);
        
        // Interpolation state
        this.interpT = 1.0;
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
        
        // Timeline mode for offline rendering (LFO simulation)
        this.timeline = null;
        this.timelineFrameSize = 0;
        this.timelineNumFrames = 0;
        this.timelineTotalSamples = 0;
        this.sampleCount = 0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-timeline') {
                // Timeline of spectral frames for offline rendering
                this.timeline = e.data.frames;
                this.timelineFrameSize = e.data.frameSize;
                this.timelineNumFrames = e.data.numFrames;
                this.timelineTotalSamples = e.data.totalSamples;
                this.sampleCount = 0;
                this.envelopeSize = this.timelineFrameSize / 4;
                // Initialize envelope from first frame
                let maxMag = 0;
                for (let i = 0; i < this.envelopeSize; i++) {
                    const mag = this.timeline[i * 4];
                    if (mag > maxMag) maxMag = mag;
                }
                const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;
                for (let i = 0; i < this.envelopeSize; i++) {
                    this.envelope[i] = this.timeline[i * 4] * scale;
                }
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                const numPoints = data.length / 4;
                this.envelopeSize = numPoints;
                
                let maxMag = 0;
                for (let i = 0; i < numPoints; i++) {
                    const mag = data[i * 4];
                    if (mag > maxMag) maxMag = mag;
                }
                
                const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;
                
                if (this.interpSamples === 0) {
                    // No interpolation - instant update
                    for (let i = 0; i < numPoints; i++) {
                        this.envelope[i] = data[i * 4] * scale;
                        this.targetEnvelope[i] = this.envelope[i];
                    }
                    // Acknowledge data received for offline rendering sync
                    this.port.postMessage({ type: 'ready' });
                } else {
                    // Snapshot current envelope as previous
                    this.prevEnvelope.set(this.envelope);
                    
                    for (let i = 0; i < numPoints; i++) {
                        this.targetEnvelope[i] = data[i * 4] * scale;
                    }
                    
                    // Reset interpolation
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency') {
                this.frequency = e.data.value;
            } else if (e.data.type === 'carrier') {
                this.carrierType = e.data.value;
            } else if (e.data.type === 'feedback') {
                this.feedback = e.data.value;
            } else if (e.data.type === 'octave-doubling') {
                this.octaveLow = e.data.low;
                this.octaveHigh = e.data.high;
                this.octaveMult = e.data.multiplier;
            } else if (e.data.type === 'interp-samples') {
                this.interpSamples = e.data.value;
                this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
            }
        };
    }
    
    // Generate carrier waveform sample at phase (0-1)
    carrier(phase, type) {
        switch (type) {
            case 0: // Sine
                return Math.sin(phase * 2 * Math.PI);
            case 1: // Saw (falling)
                return 1 - 2 * phase;
            case 2: // Square
                return phase < 0.5 ? 1 : -1;
            case 3: // Triangle
                return phase < 0.5 
                    ? 4 * phase - 1 
                    : 3 - 4 * phase;
            default:
                return Math.sin(phase * 2 * Math.PI);
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        if (this.envelopeSize < 2) {
            for (let i = 0; i < channelL.length; i++) {
                channelL[i] = 0;
                channelR[i] = 0;
            }
            return true;
        }
        
        const carrierPhaseInc = this.frequency / sampleRate;
        const envPhaseInc = carrierPhaseInc;
        const nyquist = sampleRate * 0.5;
        
        for (let i = 0; i < channelL.length; i++) {
            // Timeline mode: step through pre-computed frames
            if (this.timeline && this.timelineNumFrames > 1) {
                const progress = this.sampleCount / this.timelineTotalSamples;
                const framePos = progress * (this.timelineNumFrames - 1);
                const frame0 = Math.floor(framePos);
                const frame1 = Math.min(frame0 + 1, this.timelineNumFrames - 1);
                const t = framePos - frame0;
                const offset0 = frame0 * this.timelineFrameSize;
                const offset1 = frame1 * this.timelineFrameSize;
                // Interpolate envelope from timeline frames
                let maxMag = 0;
                for (let j = 0; j < this.envelopeSize; j++) {
                    const mag0 = this.timeline[offset0 + j * 4];
                    const mag1 = this.timeline[offset1 + j * 4];
                    const mag = mag0 * (1 - t) + mag1 * t;
                    if (mag > maxMag) maxMag = mag;
                }
                const scale = maxMag > 0.001 ? 1.0 / maxMag : 1.0;
                for (let j = 0; j < this.envelopeSize; j++) {
                    const mag0 = this.timeline[offset0 + j * 4];
                    const mag1 = this.timeline[offset1 + j * 4];
                    this.envelope[j] = (mag0 * (1 - t) + mag1 * t) * scale;
                }
                this.sampleCount++;
            }
            // Per-sample interpolation advance (skip if disabled)
            else if (this.interpSamples > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;
                
                const t = this.interpT;
                const invT = 1.0 - t;
                for (let j = 0; j < this.envelopeSize; j++) {
                    this.envelope[j] = this.prevEnvelope[j] * invT + this.targetEnvelope[j] * t;
                }
            }
            
            // Get envelope with linear interpolation
            const envPos = this.envPhase * this.envelopeSize;
            const envIdx0 = Math.floor(envPos) % this.envelopeSize;
            const envIdx1 = (envIdx0 + 1) % this.envelopeSize;
            const envFrac = envPos - Math.floor(envPos);
            const amplitude = this.envelope[envIdx0] * (1 - envFrac) + this.envelope[envIdx1] * envFrac;
            
            // Get base carrier sample
            let carrierSample = this.carrier(this.phase, this.carrierType);
            
            // Mix in feedback: blend carrier with previous output
            // feedback=0: pure carrier, feedback=1: 50/50 mix with previous
            if (this.feedback > 0) {
                carrierSample = carrierSample * (1 - this.feedback * 0.5) + this.lastSample * this.feedback * 0.5;
            }
            
            // AM synthesis: carrier * envelope
            let totalSample = carrierSample * amplitude;
            
            // Add low octaves (doubling below)
            let harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveLow; h++) {
                const harmFreq = this.frequency / Math.pow(2, h);
                if (harmFreq < 20) break;
                const phaseIdx = h - 1;
                const harmPhaseInc = harmFreq / sampleRate;
                
                let harmCarrier = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);
                
                // Get envelope at harmonic's position
                const harmEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                const hEnvIdx0 = Math.floor(harmEnvPos) % this.envelopeSize;
                const hEnvIdx1 = (hEnvIdx0 + 1) % this.envelopeSize;
                const hEnvFrac = harmEnvPos - Math.floor(harmEnvPos);
                const harmAmp = this.envelope[hEnvIdx0] * (1 - hEnvFrac) + this.envelope[hEnvIdx1] * hEnvFrac;
                
                totalSample += harmCarrier * harmAmp * harmGain;
                
                // Advance harmonic phases
                this.harmonicPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicPhases[phaseIdx] >= 1.0) this.harmonicPhases[phaseIdx] -= 1.0;
                this.harmonicEnvPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicEnvPhases[phaseIdx] >= 1.0) this.harmonicEnvPhases[phaseIdx] -= 1.0;
                
                harmGain *= this.octaveMult;
            }
            
            // Add high octaves (doubling above)
            harmGain = this.octaveMult;
            for (let h = 1; h <= this.octaveHigh; h++) {
                const harmFreq = this.frequency * Math.pow(2, h);
                if (harmFreq >= nyquist) break;
                const phaseIdx = 10 + (h - 1);
                const harmPhaseInc = harmFreq / sampleRate;
                
                let harmCarrier = this.carrier(this.harmonicPhases[phaseIdx], this.carrierType);
                
                // Get envelope at harmonic's position
                const harmEnvPos = this.harmonicEnvPhases[phaseIdx] * this.envelopeSize;
                const hEnvIdx0 = Math.floor(harmEnvPos) % this.envelopeSize;
                const hEnvIdx1 = (hEnvIdx0 + 1) % this.envelopeSize;
                const hEnvFrac = harmEnvPos - Math.floor(harmEnvPos);
                const harmAmp = this.envelope[hEnvIdx0] * (1 - hEnvFrac) + this.envelope[hEnvIdx1] * hEnvFrac;
                
                totalSample += harmCarrier * harmAmp * harmGain;
                
                // Advance harmonic phases
                this.harmonicPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicPhases[phaseIdx] >= 1.0) this.harmonicPhases[phaseIdx] -= 1.0;
                this.harmonicEnvPhases[phaseIdx] += harmPhaseInc;
                if (this.harmonicEnvPhases[phaseIdx] >= 1.0) this.harmonicEnvPhases[phaseIdx] -= 1.0;
                
                harmGain *= this.octaveMult;
            }
            
            // Store for feedback
            this.lastSample = totalSample;
            
            const gain = 0.5;
            channelL[i] = totalSample * gain;
            channelR[i] = totalSample * gain;
            
            // Advance phases
            this.phase += carrierPhaseInc;
            if (this.phase >= 1.0) this.phase -= 1.0;
            
            this.envPhase += envPhaseInc;
            if (this.envPhase >= 1.0) this.envPhase -= 1.0;
        }
        
        return true;
    }
}
registerProcessor('wavetable-processor', WavetableProcessor);
`,me=`
const DEFAULT_INTERP_SAMPLES = 64;

class WhitenoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Interpolation setting
        this.interpSamples = DEFAULT_INTERP_SAMPLES;
        
        this.spectralData = new Float32Array(1024 * 4);
        this.prevData = new Float32Array(1024 * 4);
        this.targetData = new Float32Array(1024 * 4);
        
        // State Variable Filter states (low and band) per potential filter band
        this.lowStates = new Float32Array(1024);
        this.bandStates = new Float32Array(1024);
        
        // Octave doubling filter states (10 low + 10 high) per bin
        this.harmLowStates = new Float32Array(1024 * 20);
        this.harmBandStates = new Float32Array(1024 * 20);
        
        this.frequencyMultiplier = 1.0;
        
        // Octave Doubling: layering octaves for filter bands
        this.octaveLow = 0;
        this.octaveHigh = 0;
        this.octaveMult = 0.5;
        
        this.interpT = 1.0;
        this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
        
        // Timeline mode for offline rendering (LFO simulation)
        this.timeline = null;
        this.timelineFrameSize = 0;
        this.timelineNumFrames = 0;
        this.timelineTotalSamples = 0;
        this.sampleCount = 0;
        
        this.port.onmessage = (e) => {
            if (e.data.type === 'spectral-timeline') {
                // Timeline of spectral frames for offline rendering
                this.timeline = e.data.frames;
                this.timelineFrameSize = e.data.frameSize;
                this.timelineNumFrames = e.data.numFrames;
                this.timelineTotalSamples = e.data.totalSamples;
                this.sampleCount = 0;
                // Initialize with first frame
                for (let i = 0; i < this.timelineFrameSize; i++) {
                    this.spectralData[i] = this.timeline[i];
                }
                this.port.postMessage({ type: 'ready' });
            } else if (e.data.type === 'spectral-data') {
                const data = e.data.data;
                if (this.interpSamples === 0) {
                    this.spectralData.set(data);
                    this.targetData.set(data);
                    // Acknowledge data received for offline rendering sync
                    this.port.postMessage({ type: 'ready' });
                } else {
                    this.prevData.set(this.spectralData);
                    this.targetData.set(data);
                    this.interpT = 0.0;
                }
            } else if (e.data.type === 'frequency-multiplier') {
                this.frequencyMultiplier = e.data.value;
            } else if (e.data.type === 'octave-doubling') {
                this.octaveLow = e.data.low;
                this.octaveHigh = e.data.high;
                this.octaveMult = e.data.multiplier;
            } else if (e.data.type === 'interp-samples') {
                this.interpSamples = e.data.value;
                this.interpStep = this.interpSamples > 0 ? 1.0 / (this.interpSamples + 1) : 1.0;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelL = output[0];
        const channelR = output[1];
        
        const numPoints = this.spectralData.length / 4;
        
        for (let i = 0; i < channelL.length; i++) {
            // Timeline mode: step through pre-computed frames
            if (this.timeline && this.timelineNumFrames > 1) {
                const progress = this.sampleCount / this.timelineTotalSamples;
                const framePos = progress * (this.timelineNumFrames - 1);
                const frame0 = Math.floor(framePos);
                const frame1 = Math.min(frame0 + 1, this.timelineNumFrames - 1);
                const t = framePos - frame0;
                const offset0 = frame0 * this.timelineFrameSize;
                const offset1 = frame1 * this.timelineFrameSize;
                for (let j = 0; j < this.timelineFrameSize; j++) {
                    this.spectralData[j] = this.timeline[offset0 + j] * (1 - t) + this.timeline[offset1 + j] * t;
                }
                this.sampleCount++;
            }
            // Per-sample interpolation for smooth parameter changes
            else if (this.interpSamples > 0 && this.interpT < 1.0) {
                this.interpT += this.interpStep;
                if (this.interpT > 1.0) this.interpT = 1.0;
                const t = this.interpT;
                const invT = 1.0 - t;
                for (let j = 0; j < this.spectralData.length; j++) {
                    this.spectralData[j] = this.prevData[j] * invT + this.targetData[j] * t;
                }
            }
            
            // Source: White Noise
            const noise = Math.random() * 2 - 1;
            let sumSubtracted = 0;
            
            const minFreq = 20;
            const maxFreq = 20000;
            const freqRange = maxFreq - minFreq;
            const binWidth = freqRange / numPoints;
            
            // Subtractive Filtering (Parallel Bank of SVF Band-Pass filters subtracted from noise)
            for (let bin = 0; bin < numPoints; bin++) {
                const idx = bin * 4;
                const suppression = this.spectralData[idx]; // R channel: Suppression amount
                const qVal = this.spectralData[idx + 1];    // G channel: Width multiplier
                
                if (suppression < 0.001) continue;
                
                // Frequency mapped to index (consistent with Spectral mode)
                const normalizedBin = bin / numPoints;
                const baseFreq = minFreq + freqRange * normalizedBin;
                const freq = baseFreq * this.frequencyMultiplier;
                
                if (freq >= sampleRate * 0.48) continue; // Protect SVF stability
                
                // Bandwidth: one bin width scaled by Green channel
                const widthInBins = qVal * 10 + 0.1;
                const BW = binWidth * widthInBins;
                
                // Q = center_freq / bandwidth
                const Q = Math.max(0.5, freq / BW);
                
                // SVF Coefficients (Standard SVF for subtraction)
                const f = 2.0 * Math.sin(Math.PI * freq / sampleRate);
                const q = 1.0 / Q;
                
                // SVF Update Equations for Band-Pass
                this.lowStates[bin] = this.lowStates[bin] + f * this.bandStates[bin];
                const high = noise - this.lowStates[bin] - q * this.bandStates[bin];
                const band = f * high + this.bandStates[bin];
                this.bandStates[bin] = band;
                
                // Add to parallel subtraction sum
                sumSubtracted += band * suppression;
            }
            
            const sample = noise - sumSubtracted;
            
            const gain = 0.01; // User adjusted gain
            channelL[i] = sample * gain;
            channelR[i] = sample * gain;
        }
        
        return true;
    }
}
registerProcessor('whitenoise-processor', WhitenoiseProcessor);
`;class it{constructor(){l(this,"ctx");l(this,"workletNode",null);l(this,"isInitialized",!1);l(this,"currentMode",T.WAVETABLE);l(this,"timeDomainDataL");l(this,"timeDomainDataR");l(this,"frequencyDataL");l(this,"frequencyDataR");l(this,"splitNode");l(this,"analyserL");l(this,"analyserR");l(this,"masterGain");l(this,"attack",.1);l(this,"decay",.2);l(this,"sustain",.5);l(this,"release",.5);l(this,"lastNoteTime",0);l(this,"isNoteOn",!1);l(this,"wavetableFrequency",220);l(this,"carrierType",0);l(this,"feedback",0);l(this,"octaveLow",0);l(this,"octaveHigh",0);l(this,"octaveMult",.5);this.ctx=new(window.AudioContext||window.webkitAudioContext),this.splitNode=this.ctx.createChannelSplitter(2),this.analyserL=this.ctx.createAnalyser(),this.analyserR=this.ctx.createAnalyser(),this.masterGain=this.ctx.createGain(),this.masterGain.gain.value=0,this.analyserL.fftSize=2048,this.analyserR.fftSize=2048,this.timeDomainDataL=new Float32Array(this.analyserL.fftSize),this.timeDomainDataR=new Float32Array(this.analyserR.fftSize),this.frequencyDataL=new Float32Array(this.analyserL.frequencyBinCount),this.frequencyDataR=new Float32Array(this.analyserR.frequencyBinCount),this.splitNode.connect(this.analyserL,0),this.splitNode.connect(this.analyserR,1)}async initialize(){if(!this.isInitialized)try{const e=new Blob([de],{type:"application/javascript"}),a=new Blob([ue],{type:"application/javascript"}),t=new Blob([pe],{type:"application/javascript"}),i=new Blob([me],{type:"application/javascript"}),s=URL.createObjectURL(e),n=URL.createObjectURL(a),r=URL.createObjectURL(t),o=URL.createObjectURL(i);await this.ctx.audioWorklet.addModule(s),await this.ctx.audioWorklet.addModule(n),await this.ctx.audioWorklet.addModule(r),await this.ctx.audioWorklet.addModule(o),URL.revokeObjectURL(s),URL.revokeObjectURL(n),URL.revokeObjectURL(r),URL.revokeObjectURL(o),this.createWorkletNode(),this.isInitialized=!0,console.log(`✓ Audio Engine initialized (mode: ${this.currentMode})`)}catch(e){console.error("Failed to initialize Audio Engine:",e)}}createWorkletNode(){this.workletNode&&(this.workletNode.disconnect(),this.workletNode=null);let e="wavetable-processor";this.currentMode===T.SPECTRAL&&(e="spectral-processor"),this.currentMode===T.SPECTRAL_CHIRP&&(e="chirp-spectral-processor"),this.currentMode===T.WHITENOISE_BAND_Q_FILTER&&(e="whitenoise-processor"),this.workletNode=new AudioWorkletNode(this.ctx,e,{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]}),this.workletNode.connect(this.masterGain),this.masterGain.connect(this.ctx.destination),this.masterGain.connect(this.splitNode),this.currentMode===T.WAVETABLE&&this.workletNode.port.postMessage({type:"frequency",value:this.wavetableFrequency}),this.workletNode&&this.workletNode.port.postMessage({type:"octave-doubling",low:this.octaveLow,high:this.octaveHigh,multiplier:this.octaveMult})}setMode(e){e!==this.currentMode&&(this.currentMode=e,this.isInitialized&&(this.createWorkletNode(),console.log(`✓ Synth mode changed to: ${e}`)))}getMode(){return this.currentMode}setWavetableFrequency(e){this.wavetableFrequency=e,this.workletNode&&this.currentMode===T.WAVETABLE&&this.workletNode.port.postMessage({type:"frequency",value:e})}getWavetableFrequency(){return this.wavetableFrequency}setCarrier(e){this.carrierType=e,this.workletNode&&this.currentMode===T.WAVETABLE&&this.workletNode.port.postMessage({type:"carrier",value:e})}getCarrier(){return this.carrierType}setFeedback(e){this.feedback=e,this.workletNode&&this.currentMode===T.WAVETABLE&&this.workletNode.port.postMessage({type:"feedback",value:e})}getFeedback(){return this.feedback}updateSpectralData(e){!this.workletNode||!this.isInitialized||this.workletNode.port.postMessage({type:"spectral-data",data:e})}setOctaveDoubling(e,a,t){this.octaveLow=e,this.octaveHigh=a,this.octaveMult=t,this.workletNode&&this.isInitialized&&this.workletNode.port.postMessage({type:"octave-doubling",low:e,high:a,multiplier:t})}getOctaveDoubling(){return{low:this.octaveLow,high:this.octaveHigh,multiplier:this.octaveMult}}setInterpSamples(e){this.workletNode&&this.isInitialized&&this.workletNode.port.postMessage({type:"interp-samples",value:e})}getScopeData(){return this.analyserL.getFloatTimeDomainData(this.timeDomainDataL),this.analyserR.getFloatTimeDomainData(this.timeDomainDataR),{left:this.timeDomainDataL,right:this.timeDomainDataR}}getAudioSpectralData(){return this.analyserL.getFloatFrequencyData(this.frequencyDataL),this.analyserR.getFloatFrequencyData(this.frequencyDataR),{left:this.frequencyDataL,right:this.frequencyDataR}}setSpectralPitch(e){const a=this.currentMode===T.SPECTRAL||this.currentMode===T.SPECTRAL_CHIRP||this.currentMode===T.WHITENOISE_BAND_Q_FILTER;this.workletNode&&a&&this.workletNode.port.postMessage({type:"frequency-multiplier",value:e})}resume(){this.ctx.state==="suspended"&&this.ctx.resume()}triggerAttack(e){const a=this.ctx.currentTime;this.lastNoteTime=a,this.isNoteOn=!0,e&&(this.attack=e.a,this.decay=e.d,this.sustain=e.s),this.masterGain.gain.cancelScheduledValues(a);const t=this.masterGain.gain.value;this.masterGain.gain.setValueAtTime(t,a),this.masterGain.gain.linearRampToValueAtTime(1,a+this.attack),this.masterGain.gain.linearRampToValueAtTime(this.sustain,a+this.attack+this.decay)}triggerRelease(e){const a=this.ctx.currentTime;this.isNoteOn=!1,e!==void 0&&(this.release=e),this.masterGain.gain.cancelScheduledValues(a);const t=this.masterGain.gain.value;this.masterGain.gain.setValueAtTime(t,a),this.masterGain.gain.linearRampToValueAtTime(0,a+this.release)}getEnvelopeState(){return{attack:this.attack,decay:this.decay,sustain:this.sustain,release:this.release,isNoteOn:this.isNoteOn,lastNoteTime:this.lastNoteTime,currentTime:this.ctx.currentTime}}async renderOffline(e,a,t,i){const n=a+this.release,r=Math.ceil(n*44100),o=new OfflineAudioContext(2,r,44100),h=new Blob([de],{type:"application/javascript"}),c=new Blob([pe],{type:"application/javascript"}),u=new Blob([me],{type:"application/javascript"}),g=URL.createObjectURL(h),f=URL.createObjectURL(c),p=URL.createObjectURL(u),m=new Blob([ue],{type:"application/javascript"}),v=URL.createObjectURL(m);await o.audioWorklet.addModule(g),await o.audioWorklet.addModule(v),await o.audioWorklet.addModule(f),await o.audioWorklet.addModule(p),URL.revokeObjectURL(g),URL.revokeObjectURL(v),URL.revokeObjectURL(f),URL.revokeObjectURL(p);let y="wavetable-processor";i.mode===T.SPECTRAL&&(y="spectral-processor"),i.mode===T.SPECTRAL_CHIRP&&(y="chirp-spectral-processor"),i.mode===T.WHITENOISE_BAND_Q_FILTER&&(y="whitenoise-processor");const b=new AudioWorkletNode(o,y,{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]}),S=o.createGain();if(S.gain.value=0,b.connect(S),S.connect(o.destination),b.port.postMessage({type:"octave-doubling",low:i.octaveDoubling.low,high:i.octaveDoubling.high,multiplier:i.octaveDoubling.multiplier}),i.mode===T.WAVETABLE){const x=440*Math.pow(2,(e-69)/12);b.port.postMessage({type:"frequency",value:x}),b.port.postMessage({type:"carrier",value:i.wavetableParams.carrier}),b.port.postMessage({type:"feedback",value:i.wavetableParams.feedback})}else{const x=440*Math.pow(2,(e-69)/12);b.port.postMessage({type:"frequency-multiplier",value:x/440})}i.timeline?b.port.postMessage({type:"spectral-timeline",frames:t,frameSize:i.timeline.frameSize,numFrames:i.timeline.numFrames,totalSamples:r}):(b.port.postMessage({type:"interp-samples",value:0}),b.port.postMessage({type:"spectral-data",data:t})),await new Promise(x=>{b.port.onmessage=E=>{E.data.type==="ready"&&x()}});const M=0;S.gain.setValueAtTime(0,M),S.gain.linearRampToValueAtTime(1,M+this.attack),S.gain.linearRampToValueAtTime(this.sustain,M+this.attack+this.decay);const w=a;S.gain.setValueAtTime(this.sustain,w),S.gain.linearRampToValueAtTime(0,w+this.release);const P=await o.startRendering();return this.audioBufferToWav(P)}audioBufferToWav(e){const a=e.numberOfChannels,t=e.length*a*2+44,i=new ArrayBuffer(t),s=new DataView(i),n=[];let r,o,h=0,c=0;for(g(1179011410),g(t-8),g(1163280727),g(544501094),g(16),u(1),u(a),g(e.sampleRate),g(e.sampleRate*2*a),u(a*2),u(16),g(1635017060),g(t-c-4),r=0;r<e.numberOfChannels;r++)n.push(e.getChannelData(r));for(;c<t;){for(r=0;r<a;r++)o=Math.max(-1,Math.min(1,n[r][h])),o=(o<0?o*32768:o*32767)|0,s.setInt16(c,o,!0),c+=2;h++}return new Blob([i],{type:"audio/wav"});function u(f){s.setUint16(c,f,!0),c+=2}function g(f){s.setUint32(c,f,!0),c+=4}}}class nt{constructor(){l(this,"audioContext");this.audioContext=new(window.AudioContext||window.webkitAudioContext)}async analyzeMultipleFiles(e,a,t){const{x:i,y:s,z:n}=a,r=e.length;console.log(`Analyzing ${r} files for morphing into ${i}x${s}x${n} volume`);const o=new Float32Array(i*s*n*4);for(let h=0;h<r;h++){const c=e[h],u=await c.arrayBuffer(),g=await this.audioContext.decodeAudioData(u),f=g.getChannelData(0),p=g.sampleRate;console.log(`  [${h+1}/${r}] ${c.name}: ${g.duration.toFixed(2)}s`);const m=r===1?0:-1+h/(r-1)*2,v=Math.round((m+1)*.5*(s-1)),y=2048,b=n*y,S=this.timeStretch(f,b),M=20,w=2e4;for(let P=0;P<n;P++){const x=P*y,E=new Float32Array(y);for(let C=0;C<y;C++)x+C<S.length&&(E[C]=S[x+C]);for(let C=0;C<y;C++)E[C]*=.5*(1-Math.cos(2*Math.PI*C/y));const R=this.simpleFFT(E);for(let C=0;C<i;C++){const I=C/i,A=M+(w-M)*I,O=Math.floor(A*y/p),k=Math.max(0,Math.min(R.length-1,O)),D=R[k]||0;let L=0;D>1e-6&&(L=(20*Math.log10(D)+60)/60,L=Math.max(0,Math.min(1,L)));const F=(P*s*i+v*i+C)*4;o[F]=L,o[F+1]=C/i,o[F+2]=C/i,o[F+3]=P/n}if(t&&P%10===0){const C=h/r*100,I=P/n/r*100;t(C+I)}P%20===0&&await new Promise(C=>requestAnimationFrame(C))}}return t&&t(100),console.log("✓ Multi-file morphing volume created"),o}async analyzeFile(e,a,t){const i=await e.arrayBuffer(),s=await this.audioContext.decodeAudioData(i),n=s.getChannelData(0),r=n.length,o=s.sampleRate;console.log(`Analyzing: ${e.name}, ${s.duration.toFixed(2)}s, ${o}Hz, ${r} samples`);const{x:h,y:c,z:u}=a,f=u*c*2048;let p;r<f?(console.log(`Time-stretching audio: ${r} → ${f} samples (${(f/r).toFixed(2)}x)`),t&&t(10),p=this.timeStretch(n,f),t&&t(20)):(p=n,t&&t(15));const m=new Float32Array(h*c*u*4),v=u;let y=0,b=performance.now();const S=Math.floor(p.length/u),M=20,w=2e4;for(let P=0;P<u;P++){const x=P*S,E=2048,R=new Float32Array(E);for(let A=0;A<E;A++)x+A<p.length&&(R[A]=p[x+A]);for(let A=0;A<E;A++)R[A]*=.5*(1-Math.cos(2*Math.PI*A/E));const C=this.simpleFFT(R),I=C.length;for(let A=0;A<h;A++){const O=A/h,k=M+(w-M)*O,D=Math.floor(k*E/o),L=Math.max(0,Math.min(I-1,D)),F=C[L]||0;let V=0;F>1e-6&&(V=(20*Math.log10(F)+60)/60,V=Math.max(0,Math.min(1,V)));for(let z=0;z<c;z++){const U=(P*c*h+z*h+A)*4;m[U]=V,m[U+1]=A/h,m[U+2]=A/h,m[U+3]=P/u}}if(y++,t&&y%5===0){const A=20+y/v*80;t(A)}performance.now()-b>12&&(await new Promise(A=>requestAnimationFrame(A)),b=performance.now())}return t&&t(100),console.log("✓ Converted to spectral volume"),{data:m,adjustedSize:a}}timeStretch(e,a){const t=new Float32Array(a),i=e.length/a;for(let s=0;s<a;s++){const n=s*i,r=Math.floor(n),o=n-r;r+1<e.length?t[s]=e[r]*(1-o)+e[r+1]*o:t[s]=e[r]}return t}simpleFFT(e){const a=e.length,t=new Float32Array(a/2);for(let i=0;i<a/2;i++){let s=0,n=0;for(let r=0;r<a;r++){const o=-2*Math.PI*i*r/a;s+=e[r]*Math.cos(o),n+=e[r]*Math.sin(o)}t[i]=Math.sqrt(s*s+n*n)/a}return t}}class ot{constructor(){l(this,"midiAccess",null);l(this,"activeInput",null);l(this,"activeNotes",new Map);l(this,"onNoteChangeCallback",null);l(this,"onConnectionChangeCallback",null);l(this,"onRawNoteCallback",null);this.initialize()}async initialize(){try{if(navigator.requestMIDIAccess){this.midiAccess=await navigator.requestMIDIAccess();const e=this.midiAccess.inputs.values();for(let a of e){this.setInput(a);break}this.midiAccess.onstatechange=a=>{console.log("MIDI State Change:",a.port.name,a.port.state,a.port.connection),a.port.type==="input"&&(a.port.state==="connected"&&!this.activeInput?this.setInput(a.port):a.port.state==="disconnected"&&this.activeInput&&this.activeInput.id===a.port.id&&(this.activeInput=null,this.onConnectionChangeCallback&&this.onConnectionChangeCallback(!1)))}}else console.warn("Web MIDI API not supported in this browser.")}catch(e){console.error("MIDI Access Failed:",e)}}setInput(e){this.activeInput=e,console.log(`MIDI Input Selected: ${e.name}`),e.onmidimessage=a=>{this.handleMessage(a)},this.onConnectionChangeCallback&&this.onConnectionChangeCallback(!0)}handleMessage(e){const[a,t,i]=e.data,s=a&240,n=t,r=i;s===144&&r>0?(this.activeNotes.set(n,r),this.triggerHighestNote(),this.onRawNoteCallback&&this.onRawNoteCallback(n,r)):(s===128||s===144&&r===0)&&(this.activeNotes.delete(n),this.triggerHighestNote(),this.onRawNoteCallback&&this.onRawNoteCallback(n,0))}triggerHighestNote(){if(!this.onNoteChangeCallback)return;if(this.activeNotes.size===0){this.onNoteChangeCallback(null);return}let e=-1;for(let a of this.activeNotes.keys())a>e&&(e=a);e!==-1&&this.onNoteChangeCallback(e)}setNoteChangeCallback(e){this.onNoteChangeCallback=e}setRawNoteCallback(e){this.onRawNoteCallback=e}setConnectionChangeCallback(e){this.onConnectionChangeCallback=e}getInputs(){if(!this.midiAccess)return[];const e=[];return this.midiAccess.inputs.forEach(a=>{e.push({id:a.id,name:a.name})}),e}selectInput(e){if(!this.midiAccess)return;const a=this.midiAccess.inputs.get(e);a&&this.setInput(a)}simulateNoteOn(e,a){this.activeNotes.set(e,a),this.triggerHighestNote(),this.onRawNoteCallback&&this.onRawNoteCallback(e,a)}simulateNoteOff(e){this.activeNotes.delete(e),this.triggerHighestNote(),this.onRawNoteCallback&&this.onRawNoteCallback(e,0)}}class rt{constructor(e,a){l(this,"canvas");l(this,"ctx");l(this,"engine");l(this,"width",0);l(this,"height",0);l(this,"maxTime",2);l(this,"padding",20);l(this,"isDragging",!1);l(this,"activeNode",-1);l(this,"sustainVisualDuration",.5);let t=null;if(typeof e=="string"?t=document.getElementById(e):t=e,!t)throw new Error("Canvas not found");this.canvas=t,this.ctx=this.canvas.getContext("2d"),this.engine=a,this.resize(),window.addEventListener("resize",()=>this.resize()),this.canvas.addEventListener("mousedown",this.onMouseDown.bind(this)),window.addEventListener("mousemove",this.onMouseMove.bind(this)),window.addEventListener("mouseup",this.onMouseUp.bind(this)),this.animate()}resize(){this.canvas.width=this.canvas.clientWidth,this.canvas.height=this.canvas.clientHeight,this.width=this.canvas.width,this.height=this.canvas.height,this.draw()}animate(){this.draw(),requestAnimationFrame(()=>this.animate())}draw(){const{width:e,height:a,ctx:t}=this,i=this.engine.getEnvelopeState();t.fillStyle="#08080c",t.fillRect(0,0,e,a),t.strokeStyle="#222",t.lineWidth=1,t.beginPath();for(let p=0;p<=this.maxTime;p+=.5){const m=this.timeToX(p);t.moveTo(m,0),t.lineTo(m,a)}for(let p=0;p<=1;p+=.5){const m=this.valToY(p);t.moveTo(0,m),t.lineTo(e,m)}t.stroke();const s=i.attack,n=i.decay,r=i.sustain,o=i.release,h={x:0,y:0},c={x:s,y:1},u={x:s+n,y:r},g={x:s+n+this.sustainVisualDuration,y:r},f={x:s+n+this.sustainVisualDuration+o,y:0};if(t.strokeStyle="#00ff88",t.lineWidth=2,t.beginPath(),t.moveTo(this.timeToX(h.x),this.valToY(h.y)),t.lineTo(this.timeToX(c.x),this.valToY(c.y)),t.lineTo(this.timeToX(u.x),this.valToY(u.y)),t.lineTo(this.timeToX(g.x),this.valToY(g.y)),t.lineTo(this.timeToX(f.x),this.valToY(f.y)),t.stroke(),this.drawNode(c.x,c.y,this.activeNode===0),this.drawNode(u.x,u.y,this.activeNode===1),this.drawNode(f.x,f.y,this.activeNode===2),t.fillStyle="#666",t.font="10px Inter",t.fillText("A",this.timeToX(c.x),this.valToY(c.y)-10),t.fillText("D",this.timeToX(u.x),this.valToY(u.y)-10),t.fillText("R",this.timeToX(f.x),this.valToY(f.y)-10),i.isNoteOn){const p=i.currentTime-i.lastNoteTime;let m=0;if(p<s+n)m=p;else{const y=p-(s+n),b=s+n+this.sustainVisualDuration;m=Math.min(s+n+y,b)}const v=this.timeToX(m);t.strokeStyle="#0088ff",t.lineWidth=2,t.beginPath(),t.moveTo(v,0),t.lineTo(v,a),t.stroke()}}drawNode(e,a,t){const i=this.timeToX(e),s=this.valToY(a);this.ctx.beginPath(),this.ctx.arc(i,s,6,0,Math.PI*2),this.ctx.fillStyle=t?"#fff":"#00ff88",this.ctx.fill(),this.ctx.stroke()}timeToX(e){return this.padding+e/this.maxTime*(this.width-2*this.padding)}xToTime(e){return(e-this.padding)/(this.width-2*this.padding)*this.maxTime}valToY(e){const a=this.height-2*this.padding;return this.height-this.padding-e*a}yToVal(e){const a=this.height-2*this.padding;return(this.height-this.padding-e)/a}onMouseDown(e){const a=this.canvas.getBoundingClientRect(),t=e.clientX-a.left,i=e.clientY-a.top,s=this.engine.getEnvelopeState(),n={t:s.attack,v:1},r={t:s.attack+s.decay,v:s.sustain},o={t:s.attack+s.decay+this.sustainVisualDuration+s.release,v:0},h=[n,r,o];for(let c=0;c<h.length;c++){const u=this.timeToX(h[c].t),g=this.valToY(h[c].v);if(Math.sqrt((t-u)**2+(i-g)**2)<10){this.isDragging=!0,this.activeNode=c;return}}}onMouseMove(e){if(!this.isDragging)return;const a=this.canvas.getBoundingClientRect(),t=e.clientX-a.left,i=e.clientY-a.top,s=Math.max(0,this.xToTime(t)),n=Math.max(0,Math.min(1,this.yToVal(i))),r=this.engine.getEnvelopeState();if(this.activeNode===0)this.engine.attack=s;else if(this.activeNode===1){this.engine.sustain=n;const o=s-r.attack;this.engine.decay=Math.max(0,o)}else if(this.activeNode===2){const o=r.attack+r.decay+this.sustainVisualDuration,h=s-o;this.engine.release=Math.max(.01,h)}}onMouseUp(){this.isDragging=!1,this.activeNode=-1}}const W=class W{constructor(e){l(this,"container");l(this,"keys",new Map);l(this,"activeNotes",new Set);l(this,"onNoteChange",null);l(this,"numOctaves",5);l(this,"baseOctave",3);l(this,"startNote",36);l(this,"endNote",72);l(this,"heldKeys",new Set);const a=document.getElementById(e);if(!a)throw new Error(`Container ${e} not found`);this.container=a,this.updateRange(),this.setupKeyboardListeners(),this.container.addEventListener("selectstart",t=>t.preventDefault())}setBaseOctave(e){this.baseOctave=e,this.updateRange()}updateRange(){this.startNote=this.baseOctave*12,this.endNote=this.startNote+this.numOctaves*12,this.createKeys()}setupKeyboardListeners(){window.addEventListener("keydown",e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;const a=e.key.toLowerCase();if(this.heldKeys.has(a))return;const t=W.KEY_MAP[a];if(t){e.preventDefault(),this.heldKeys.add(a);const[i,s]=t,n=(this.baseOctave+i)*12+s;this.triggerNoteOn(n)}}),window.addEventListener("keyup",e=>{const a=e.key.toLowerCase();if(this.heldKeys.has(a)){this.heldKeys.delete(a);const t=W.KEY_MAP[a];if(t){const[i,s]=t,n=(this.baseOctave+i)*12+s;this.triggerNoteOff(n)}}}),window.addEventListener("blur",()=>{for(const e of this.heldKeys){const a=W.KEY_MAP[e];if(a){const[t,i]=a,s=(this.baseOctave+t)*12+i;this.triggerNoteOff(s)}}this.heldKeys.clear()})}createKeys(){this.container.innerHTML="",this.keys.clear();const e=[0,2,4,5,7,9,11];let a=0;for(let s=this.startNote;s<=this.endNote;s++)e.includes(s%12)&&a++;const t=100/a;let i=0;for(let s=this.startNote;s<=this.endNote;s++){const n=Math.floor(s/12),r=s%12,o=e.includes(r),h=document.createElement("div");this.keys.set(s,h),h.dataset.note=String(s),o?(h.className="piano-key white",h.style.width=`${t}%`,h.style.left=`${i*t}%`,i++):(h.className="piano-key black",h.style.width=`${t*.7}%`,h.style.left=`${(i-1)*t+t*.65}%`,h.style.zIndex="2");const c=this.getKeyHint(n,r);if(c){const u=document.createElement("span");u.className="key-hint",u.textContent=c,h.appendChild(u)}h.addEventListener("mousedown",u=>{if(u.buttons===1){this.triggerNoteOn(s);const g=()=>{this.triggerNoteOff(s),window.removeEventListener("mouseup",g)};window.addEventListener("mouseup",g)}}),h.addEventListener("mouseenter",u=>{u.buttons===1&&(this.triggerNoteOn(s),h.addEventListener("mouseleave",()=>{this.triggerNoteOff(s)},{once:!0}))}),this.container.appendChild(h)}}getKeyHint(e,a){const t=W.NOTE_TO_KEYS[a];return t?e===this.baseOctave?t[0]:e===this.baseOctave+1?t[1]:null:null}triggerNoteOn(e){this.activeNotes.has(e)||(this.activeNotes.add(e),this.setVisualizeState(e,!0),this.onNoteChange&&this.onNoteChange(e,127))}triggerNoteOff(e){this.activeNotes.has(e)&&(this.activeNotes.delete(e),this.setVisualizeState(e,!1),this.onNoteChange&&this.onNoteChange(e,0))}setVisualizeState(e,a){const t=this.keys.get(e);t&&(a?t.classList.add("active"):t.classList.remove("active"))}setNoteChangeCallback(e){this.onNoteChange=e}};l(W,"KEY_MAP",{z:[0,0],s:[0,1],x:[0,2],d:[0,3],c:[0,4],v:[0,5],g:[0,6],b:[0,7],h:[0,8],n:[0,9],j:[0,10],m:[0,11],q:[1,0],2:[1,1],w:[1,2],3:[1,3],e:[1,4],r:[1,5],5:[1,6],t:[1,7],6:[1,8],y:[1,9],7:[1,10],u:[1,11]}),l(W,"NOTE_TO_KEYS",{0:["z","q"],1:["s","2"],2:["x","w"],3:["d","3"],4:["c","e"],5:["v","r"],6:["g","5"],7:["b","t"],8:["h","6"],9:["n","y"],10:["j","7"],11:["m","u"]});let te=W;class Q{constructor(e=1){l(this,"waveform","sine");l(this,"frequency",.5);l(this,"amplitude",1);l(this,"phase",0);l(this,"offset",0);this.frequency=e}setWaveform(e){this.waveform=e}setFrequency(e){this.frequency=e}setAmplitude(e){this.amplitude=e}setOffset(e){this.offset=e}update(e){this.phase+=this.frequency*e,this.phase>=1&&(this.phase-=Math.floor(this.phase));let a=0;switch(this.waveform){case"sine":a=Math.sin(this.phase*2*Math.PI);break;case"square":a=this.phase<.5?1:-1;break;case"saw":a=1-2*this.phase;break;case"triangle":a=this.phase<.5?4*this.phase-1:3-4*this.phase;break}let t=a*this.amplitude+this.offset;return Math.max(-1,Math.min(1,t))}}class lt{constructor(){l(this,"glContext");l(this,"renderer");l(this,"controls");l(this,"spectrogram");l(this,"scope");l(this,"audioEngine");l(this,"audioAnalyzer");l(this,"midiHandler");l(this,"piano");l(this,"canvas");l(this,"currentNote",null);l(this,"animationFrameId",0);l(this,"uploadedVolumes",new Map);l(this,"gameOfLifeActive",!1);l(this,"gameOfLifeSpeed",.5);l(this,"gameOfLifeLastUpdate",0);l(this,"sinePlasmaActive",!1);l(this,"sinePlasmaSpeed",.5);l(this,"sinePlasmaLastUpdate",0);l(this,"lfos",[new Q(.5),new Q(.5)]);l(this,"pathYSource","none");l(this,"scanPhaseSource","none");l(this,"shapePhaseSource","none");if(console.log("Spectra Table Synthesis - Initializing..."),this.canvas=document.getElementById("gl-canvas"),!this.canvas)throw new Error("Canvas not found");this.glContext=new De(this.canvas);const e={x:fe,y:ge,z:ve};this.renderer=new Ke(this.glContext,e),this.controls=new tt("controls",{lfos:this.lfos}),this.spectrogram=new at("spectrogram-canvas"),this.scope=new st("scope-canvas"),this.audioEngine=new it;const a=this.controls.envelopeCanvas;a?new rt(a,this.audioEngine):console.error("Envelope canvas not created in controls"),this.audioAnalyzer=new nt,this.midiHandler=new ot,this.midiHandler.setNoteChangeCallback(this.onMidiNote.bind(this)),this.midiHandler.setConnectionChangeCallback(t=>{t&&console.log("✓ MIDI Device Connected"),this.controls.updateMidiInputs(this.midiHandler.getInputs())}),this.piano=new te("piano-container"),this.piano.setNoteChangeCallback((t,i)=>{i>0?this.midiHandler.simulateNoteOn(t,i):this.midiHandler.simulateNoteOff(t)}),this.midiHandler.setRawNoteCallback((t,i)=>{this.piano.setVisualizeState(t,i>0)}),this.controls.setMidiInputChangeCallback(t=>{this.midiHandler.selectInput(t)}),this.controls.setOctaveChangeCallback(t=>{this.piano.setBaseOctave(t)}),setTimeout(()=>{this.controls.updateMidiInputs(this.midiHandler.getInputs())},500),this.controls.setPathChangeCallback(this.onPathChange.bind(this)),this.controls.setVolumeResolutionChangeCallback(this.onVolumeResolutionChange.bind(this)),this.controls.setSpectralDataChangeCallback(this.onSpectralDataChange.bind(this)),this.controls.setWavUploadCallback(this.onWavUpload.bind(this)),this.controls.setSynthModeChangeCallback(this.onSynthModeChange.bind(this)),this.controls.setCarrierChangeCallback(this.onCarrierChange.bind(this)),this.controls.setFeedbackChangeCallback(this.onFeedbackChange.bind(this)),this.controls.setOctaveDoublingChangeCallback(this.onOctaveDoublingChange.bind(this)),this.controls.setInterpSamplesChangeCallback(t=>this.audioEngine.setInterpSamples(t)),this.controls.setGeneratorParamsChangeCallback(this.onGeneratorParamsChange.bind(this)),this.controls.setPresetLoadCallback(this.onPresetLoad.bind(this)),this.controls.setRenderWavCallback(this.onRenderWav.bind(this)),this.controls.setLFOParamChangeCallback((t,i,s)=>{const n=this.lfos[t];n&&(i==="waveform"&&n.setWaveform(s),i==="frequency"&&n.setFrequency(s),i==="amplitude"&&n.setAmplitude(s),i==="offset"&&n.setOffset(s))}),this.controls.setModulationRoutingChangeCallback((t,i)=>{t==="pathY"&&(this.pathYSource=i),t==="scanPhase"&&(this.scanPhaseSource=i),t==="shapePhase"&&(this.shapePhaseSource=i)}),window.addEventListener("resize",this.onResize.bind(this)),this.onResize(),this.audioEngine.initialize().then(()=>{console.log("✓ Audio engine ready (suspended until user interaction)")}),this.canvas.addEventListener("mousedown",this.onMouseDown.bind(this)),this.canvas.addEventListener("mousemove",this.onMouseMove.bind(this)),this.canvas.addEventListener("mouseup",this.onMouseUp.bind(this)),this.canvas.addEventListener("mouseleave",this.onMouseUp.bind(this)),this.canvas.addEventListener("wheel",this.onWheel.bind(this),{passive:!1}),this.canvas.addEventListener("contextmenu",t=>(t.preventDefault(),!1)),this.canvas.addEventListener("click",()=>{this.audioEngine.resume()}),window.addEventListener("keydown",t=>{t.code==="Space"&&(t.preventDefault(),this.audioEngine.resume(),console.log("Audio resumed (Space)"))}),this.startRenderLoop(),this.restoreSavedState(),console.log("✓ Application initialized")}restoreSavedState(){const e=this.controls.loadSavedState();e&&(console.log("Restoring saved state..."),this.applyPresetState(e))}onPresetLoad(e){console.log("Loading preset..."),this.applyPresetState(e)}applyPresetState(e){this.controls.applyState(e),this.lfos.forEach((t,i)=>{!e.lfos||i>=e.lfos.length||(t.setWaveform(e.lfos[i].waveform),t.setFrequency(e.lfos[i].frequency),t.setAmplitude(e.lfos[i].amplitude),t.setOffset(e.lfos[i].offset))}),this.pathYSource=e.modRouting.pathY,this.scanPhaseSource=e.modRouting.scanPhase,this.shapePhaseSource=e.modRouting.shapePhase,this.audioEngine.setMode(e.synthMode),this.audioEngine.setWavetableFrequency(e.frequency),this.audioEngine.setCarrier(e.carrier),this.audioEngine.setFeedback(e.feedback),this.audioEngine.setInterpSamples(e.interpSamples||64),e.envelopes?.[0]&&(this.audioEngine.attack=e.envelopes[0].attack,this.audioEngine.decay=e.envelopes[0].decay,this.audioEngine.sustain=e.envelopes[0].sustain,this.audioEngine.release=e.envelopes[0].release),this.piano.setBaseOctave(e.octave),e.octaveDoubling&&this.audioEngine.setOctaveDoubling(e.octaveDoubling.lowCount,e.octaveDoubling.highCount,e.octaveDoubling.multiplier);const a={x:e.densityX,y:e.densityY,z:e.densityZ};this.renderer.updateVolumeResolution(a),this.controls.updateGeneratorParamsUI(e.spectralData,e.generatorParams),this.onSpectralDataChange(e.spectralData,e.generatorParams),this.onPathChange(this.controls.getState()),console.log("✓ State applied")}onPathChange(e){this.renderer.updateReadingPath(e)}onVolumeResolutionChange(e){console.log("Volume resolution changed:",e),this.renderer.updateVolumeResolution(e);const a=document.getElementById("spectral-data-type")?.value||"blank";a==="game-of-life"&&this.gameOfLifeActive?(this.renderer.getSpectralVolume().initGameOfLife(),this.gameOfLifeLastUpdate=performance.now(),console.log("✓ Game of Life reinitialized with new density")):a==="sine-plasma"&&this.sinePlasmaActive?(this.renderer.getSpectralVolume().generateSinePlasma(0),this.sinePlasmaLastUpdate=performance.now(),console.log("✓ Sine Plasma reinitialized with new density")):this.uploadedVolumes.has(a)||this.renderer.updateSpectralData(a)}onSpectralDataChange(e,a){if(console.log("Spectral data changed:",e),this.gameOfLifeActive=!1,this.sinePlasmaActive=!1,this.controls.updateGeneratorParamsUI(e,a),this.uploadedVolumes.has(e)){const t=this.uploadedVolumes.get(e);this.renderer.getSpectralVolume().setData(t),this.controls.hideDynamicParam()}else if(e==="game-of-life"){const t=this.controls.getCurrentGeneratorParams();this.renderer.updateSpectralData(e,t||void 0),this.gameOfLifeActive=!0,this.gameOfLifeLastUpdate=performance.now(),this.controls.showDynamicParam("Evolution Speed",0,1,.5,.01),console.log("✓ Game of Life initialized")}else if(e==="sine-plasma"){const t=this.controls.getCurrentGeneratorParams();this.renderer.updateSpectralData(e,t||void 0),this.sinePlasmaActive=!0,this.sinePlasmaLastUpdate=performance.now(),this.controls.showDynamicParam("Evolution Speed",0,1,.5,.01),console.log("✓ Sine Plasma initialized with evolution")}else{const t=this.controls.getCurrentGeneratorParams();this.renderer.updateSpectralData(e,t||void 0),this.controls.hideDynamicParam()}this.audioEngine.resume()}onSynthModeChange(e){this.audioEngine.setMode(e),console.log(`✓ Synth mode: ${e}`)}onCarrierChange(e){this.audioEngine.setCarrier(e)}onFeedbackChange(e){this.audioEngine.setFeedback(e)}onOctaveDoublingChange(e){this.audioEngine.setOctaveDoubling(e.lowCount,e.highCount,e.multiplier)}onGeneratorParamsChange(e,a){this.renderer.updateSpectralData(e,a)}onMidiNote(e){if(e===null){this.currentNote=null,this.audioEngine.triggerRelease();return}if(e===this.currentNote)return;this.currentNote=e;const a=440*Math.pow(2,(e-69)/12),t=this.audioEngine.getMode();if(t===T.WAVETABLE)this.audioEngine.setWavetableFrequency(a);else if(t===T.SPECTRAL){const s=a/440;this.audioEngine.setSpectralPitch(s)}this.audioEngine.triggerAttack()}async onRenderWav(e,a){console.log(`Rendering WAV for note ${e}, duration ${a}s...`);const t=this.audioEngine.getOctaveDoubling(),i=this.controls.getFullState(),s=this.audioEngine.getEnvelopeState(),n=a+s.release,r=this.pathYSource!=="none"||this.scanPhaseSource!=="none"||this.shapePhaseSource!=="none";let o,h;if(r){const u=Math.ceil(n*60),g=1/60,f=this.lfos.map(w=>{const P=new Q(w.frequency);return P.setWaveform(w.waveform),P.setAmplitude(w.amplitude),P.setOffset(w.offset),P}),p=this.controls.getState(),m=p.position.y,v=p.scanPosition,y=p.shapePhase,S=this.renderer.getReadingLineSpectralData().length,M=new Float32Array(u*S);for(let w=0;w<u;w++){f.forEach((x,E)=>{const R=x.update(g),C=`lfo${E+1}`;this.pathYSource===C&&(p.position.y=R),this.scanPhaseSource===C&&(p.scanPosition=R),this.shapePhaseSource===C&&(p.shapePhase=R)}),this.renderer.updateReadingPath(p);const P=this.renderer.getReadingLineSpectralData();M.set(P,w*S)}p.position.y=m,p.scanPosition=v,p.shapePhase=y,this.renderer.updateReadingPath(p),o=M,h={numFrames:u,frameSize:S},console.log(`Generated ${u} frames for LFO modulation simulation`)}else o=this.renderer.getReadingLineSpectralData();try{const c=await this.audioEngine.renderOffline(e,a,o,{mode:i.synthMode,wavetableParams:{frequency:220,carrier:i.carrier,feedback:i.feedback},octaveDoubling:{low:t.low,high:t.high,multiplier:t.multiplier},interpSamples:i.interpSamples,timeline:h}),u=URL.createObjectURL(c),g=document.createElement("a");g.href=u,g.download=`spectral_sample_note_${e}.wav`,document.body.appendChild(g),g.click(),document.body.removeChild(g),URL.revokeObjectURL(u),console.log("✓ WAV render complete and downloaded")}catch(c){console.error("Offline render failed:",c),alert(`Failed to render WAV: ${c instanceof Error?c.message:"Unknown error"}`)}}async onWavUpload(e){const a=Array.from(e);console.log(`Processing ${a.length} audio file(s) for morphing`);try{this.controls.showProgress(),this.controls.updateProgress(0);const t=this.renderer.getSpectralVolume().getResolution(),i=a.length,s={...t,y:i};this.controls.setVolumeDensity(s),this.renderer.updateVolumeResolution(s);const n=await this.audioAnalyzer.analyzeMultipleFiles(a,s,o=>this.controls.updateProgress(o)),r=a.length===1?a[0].name.replace(/\.[^/.]+$/,""):`Morph_${a.length}_samples`;this.uploadedVolumes.set(r,n),this.renderer.getSpectralVolume().setData(n),this.controls.addSpectralDataOption(r,r),console.log(`✓ Processed ${a.length} file(s) into morphing volume`)}catch(t){console.error("Failed to process audio file(s):",t),alert(`Error processing audio file(s): ${t instanceof Error?t.message:"Unknown error"}`)}finally{setTimeout(()=>this.controls.hideProgress(),500)}}onResize(){const e=this.canvas.getBoundingClientRect();this.renderer.resize(e.width,e.width)}onMouseDown(e){this.renderer.onMouseDown(e.clientX,e.clientY,e.button),this.audioEngine.resume()}onMouseMove(e){this.renderer.onMouseMove(e.clientX,e.clientY)}onMouseUp(){this.renderer.onMouseUp()}onWheel(e){e.preventDefault(),this.renderer.zoom(e.deltaY)}startRenderLoop(){let e=performance.now();const a=t=>{const i=(t-e)/1e3;if(e=t,this.gameOfLifeActive&&this.gameOfLifeSpeed>0){const o=(1-this.gameOfLifeSpeed)*1e3;t-this.gameOfLifeLastUpdate>=o&&(this.renderer.getSpectralVolume().stepGameOfLife(),this.gameOfLifeLastUpdate=t)}if(this.sinePlasmaActive&&this.sinePlasmaSpeed>0){const o=(1-this.sinePlasmaSpeed)*100;t-this.sinePlasmaLastUpdate>=o&&(this.renderer.getSpectralVolume().stepSinePlasma(),this.sinePlasmaLastUpdate=t)}this.lfos.forEach((o,h)=>{const c=o.update(i),u=`lfo${h+1}`;if(this.pathYSource===u&&this.controls.updatePathY(c),this.scanPhaseSource===u&&this.controls.updateScanPosition(c),this.shapePhaseSource===u){const g=this.controls.getState();g.shapePhase=c,this.renderer.updateReadingPath(g)}}),this.renderer.render(i);const s=this.renderer.getReadingLineSpectralData();this.audioEngine.updateSpectralData(s);const n=this.audioEngine.getAudioSpectralData();this.spectrogram.update(s,n.left);const r=this.audioEngine.getScopeData();this.scope.draw(r.left,r.right),this.animationFrameId=requestAnimationFrame(a)};requestAnimationFrame(a)}destroy(){this.animationFrameId&&cancelAnimationFrame(this.animationFrameId),this.renderer.destroy()}}const ht=new lt;window.addEventListener("beforeunload",()=>{ht.destroy()});
//# sourceMappingURL=index-CuWdP37Q.js.map
