if(typeof document!=='undefined'){
  document.title='America | Desativado';
  document.querySelectorAll('.brand strong').forEach(element=>{
    element.textContent='America'
  });
  document.querySelectorAll('.brand').forEach(element=>{
    element.setAttribute('aria-label','America início')
  });
}