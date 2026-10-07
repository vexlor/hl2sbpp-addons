(function(){
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splash=document.getElementById('siteSplash');
  const finish=()=>{document.body.classList.remove('site-loading');if(splash){setTimeout(()=>splash.classList.add('hide'),120);setTimeout(()=>splash.remove(),1050)}};
  if(reduce){finish()}else{setTimeout(finish,1050)}
  window.HL2Motion={
    reveal(root=document){
      const nodes=root.querySelectorAll('.reveal:not(.visible)');
      if(!('IntersectionObserver' in window)){nodes.forEach(n=>n.classList.add('visible'));return;}
      const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.08,rootMargin:'0px 0px -40px 0px'});
      nodes.forEach(n=>io.observe(n));
    }
  };
  document.addEventListener('DOMContentLoaded',()=>window.HL2Motion.reveal());
})();
