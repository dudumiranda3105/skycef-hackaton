'use strict';
/* Login, perfis e usuários. A segurança de verdade está na API (cookie de sessão HttpOnly e permissão por perfil em
   cada chamada). Aqui a tela só espelha as permissões para não oferecer o que o perfil não pode fazer. */

const PAPEL_ROTULO={ADMIN:'Administrador',DIRETORIA:'Diretoria',COMPRAS:'Compras',ARMAZEM:'Responsável pelo armazém',ENCARREGADO:'Encarregado dos chapas',FORNECEDOR:'Fornecedor'};
/* seções que cada perfil enxerga (espelha o que a API deixa cada um chamar) */
const PAPEL_PAINEIS={
  ADMIN:['agenda','compras','armazem','boletim','painel','d1','perguntar','qualidade','usuarios'],
  DIRETORIA:['agenda','boletim','painel','d1','perguntar','qualidade'],
  COMPRAS:['agenda','compras'],
  ARMAZEM:['agenda','armazem','boletim','painel','d1','perguntar','qualidade'],
  ENCARREGADO:['agenda','boletim'],
  FORNECEDOR:['agenda']
};
/* grupos de gravação (mesma divisão de Permissoes.java) */
const GRUPOS={agendar:['ADMIN','FORNECEDOR','ARMAZEM'],armazem:['ADMIN','ARMAZEM'],compras:['ADMIN','COMPRAS'],boletim:['ADMIN','ENCARREGADO','ARMAZEM']};
const pode=painel=>!!S.eu&&(PAPEL_PAINEIS[S.eu.papel]||[]).includes(painel);
const pf=grupo=>!!S.eu&&GRUPOS[grupo].includes(S.eu.papel);
const papelRotulo=p=>PAPEL_ROTULO[p]||p;

/* ---------- tela de login ---------- */
let saiu=false;
function mostrarLogin(msg){
  $('#login').hidden=false;$('.app').inert=true;$('.app').setAttribute('aria-hidden','true');
  setMsg('#lg-msg',msg||'');$('#lg-btn').disabled=false;$('#lg-pass').value='';
  const u=$('#lg-user');if(u){if(!msg)u.value=u.value;u.focus();}
}
function esconderLogin(){$('#login').hidden=true;$('.app').inert=false;$('.app').removeAttribute('aria-hidden');}

/* limpa tudo o que foi carregado para a pessoa anterior não ficar visível na tela de quem entrar depois */
function resetarSessao(){
  Object.assign(S,{eu:null,ags:[],vagas:[],nr:[],boletins:[],diasAgenda:{},carregado:false});
  P.histAll=P.hist=P.indic=P.op=P.plat=null;QD.histAll=QD.op=QD.plat=null;
  U.pg.hist=[];U.d1.data=null;U.d1.sim={armId:null,equipe:null};U.dd={};U.eqSel={};U.route=null;U.pf.from=null;U.pf.to=null;U.usuarios=null;
  $$('.pv').forEach(p=>p.remove());$('#nav').innerHTML='';$('#home').innerHTML='';$('#userbox').hidden=true;
  stageEl.classList.remove('has-open');$('#home').inert=false;closeAll();drawer.open&&drawer.close();
}
function sairDaTela(msg){if(saiu)return;saiu=true;resetarSessao();mostrarLogin(msg);setTimeout(()=>{saiu=false;},300);}
window.addEventListener('sessao-expirada',()=>{if(S.eu)sairDaTela('Sua sessão expirou. Entre novamente.');});

document.addEventListener('submit',async e=>{
  if(e.target.id!=='lg-form')return;
  e.preventDefault();
  const login=$('#lg-user').value.trim(),senha=$('#lg-pass').value;
  if(!login||!senha){setMsg('#lg-msg','Informe o usuário e a senha.');return;}
  $('#lg-btn').disabled=true;setMsg('#lg-msg','');
  try{
    S.eu=await POST('/api/auth/login',{login,senha});
    $('#lg-pass').value='';
    await iniciar();
  }catch(err){setMsg('#lg-msg',errTxt(err));$('#lg-btn').disabled=false;$('#lg-pass').value='';$('#lg-pass').focus();}
});

/* ---------- caixa do usuário ---------- */
function atualizarUsuarioBox(){
  const b=$('#userbox'),eu=S.eu;if(!eu){b.hidden=true;return;}
  b.hidden=false;
  b.innerHTML='<div class="ub-nome">'+esc(eu.nome)+'</div><div class="ub-papel">'+esc(papelRotulo(eu.papel))+(eu.autenticacaoAtiva?'':' · login desativado')+'</div>'+
    (eu.autenticacaoAtiva?'<div class="row" style="gap:6px;margin-top:8px"><button class="side-btn" data-act="trocar-senha" style="flex:1">Alterar senha</button><button class="side-btn" data-act="sair" style="flex:1">Sair</button></div>':'');
}
function openTrocarSenha(){
  modal('Alterar senha','<label class="f">Senha atual<input type="password" id="ts-atual" autocomplete="current-password"></label>'+
    '<label class="f">Nova senha <span class="hint">de 8 a 100 caracteres</span><input type="password" id="ts-nova" autocomplete="new-password"></label>'+
    '<label class="f">Repita a nova senha<input type="password" id="ts-rep" autocomplete="new-password"></label><div id="ts-msg" class="errs"></div>'+
    '<p class="hint">Ao trocar a senha, as suas outras sessões abertas são encerradas.</p>',
    '<button class="btn" data-act="close-dlg">Cancelar</button><button class="btn primary" data-act="ts-ok">Alterar senha</button>');
}

/* ---------- gestão de usuários (só administrador) ---------- */
U.usuarios=null;
async function carregarUsuarios(){
  try{U.usuarios=await GET('/api/usuarios');}catch(e){U.usuarios={erro:errTxt(e)};}
  if(U.route==='usuarios')renderPanel('usuarios');
}
function viewUsuarios(){
  const cab=head('Usuários','Quem pode entrar e com qual perfil. Cada perfil só faz o que o processo prevê: Compras valida, o armazém recebe, o encarregado fecha o boletim, a diretoria consulta.','Quem usa: administrador');
  if(!U.usuarios)return cab+'<div class="empty">Carregando…</div>';
  if(U.usuarios.erro)return cab+'<div class="callout bad">'+esc(U.usuarios.erro)+'</div>';
  const L=U.usuarios;
  return cab+
  '<div class="panel" style="margin-bottom:20px"><h2>Novo usuário</h2><div class="grid2" style="margin-top:10px"><label class="f">Usuário<input type="text" id="nu-login" autocomplete="off" autocapitalize="none" placeholder="ex.: maria.silva"></label><label class="f">Nome<input type="text" id="nu-nome" autocomplete="off"></label>'+
   '<label class="f">Perfil<select id="nu-papel">'+optsHtml(Object.entries(PAPEL_ROTULO),'ARMAZEM')+'</select></label><label class="f">Senha inicial <span class="hint">de 8 a 100 caracteres</span><input type="password" id="nu-senha" autocomplete="new-password"></label></div>'+
   '<div id="nu-msg" class="errs" style="margin:8px 0"></div><button class="btn primary" data-act="nu-criar">Criar usuário</button></div>'+
  '<div class="panel tbl tscroll"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th class="r">Ações</th></tr></thead><tbody>'+
   L.map(u=>'<tr><td><b>'+esc(u.login)+'</b></td><td>'+esc(u.nome)+'</td><td>'+esc(papelRotulo(u.papel))+'</td><td>'+(u.ativo?'<span class="chip ok">Ativo</span>':'<span class="chip bad">Desativado</span>')+'</td><td class="num">'+(u.ultimoAcessoEm?esc(fmtTS(loc(u.ultimoAcessoEm))):'nunca')+'</td>'+
     '<td class="r"><button class="btn sm" data-act="nu-senha" data-id="'+u.id+'" data-nome="'+esc(u.login)+'">Redefinir senha</button> '+
     (S.eu&&u.id===S.eu.id?'':'<button class="btn sm '+(u.ativo?'danger':'')+'" data-act="nu-ativo" data-id="'+u.id+'" data-ativo="'+(u.ativo?'0':'1')+'">'+(u.ativo?'Desativar':'Reativar')+'</button>')+'</td></tr>').join('')+'</tbody></table></div>'+
  '<div class="sec"><div class="panel"><h2>O que cada perfil faz</h2><div class="tscroll"><table class="mini"><thead><tr><th>Perfil</th><th>Vê</th><th>Grava</th></tr></thead><tbody>'+
   '<tr><td><b>Administrador</b></td><td>tudo e usuários</td><td>tudo</td></tr>'+
   '<tr><td><b>Diretoria</b></td><td>agenda, boletim, painel, D-1, perguntas, qualidade</td><td>nada (só consulta)</td></tr>'+
   '<tr><td><b>Compras</b></td><td>agenda e validação de Compras</td><td>autorizar ou recusar a entrega</td></tr>'+
   '<tr><td><b>Responsável pelo armazém</b></td><td>agenda, armazém, boletim, painel, D-1, perguntas, qualidade</td><td>destinos, descargas, vagas, não recebimentos, boletim; agenda</td></tr>'+
   '<tr><td><b>Encarregado dos chapas</b></td><td>agenda e boletim</td><td>boletim do dia</td></tr>'+
   '<tr><td><b>Fornecedor</b></td><td>agenda</td><td>novo agendamento, anexar a nota, reagendar e solicitar cancelamento</td></tr>'+
   '</tbody></table></div><p class="hint" style="margin-top:8px">O perfil Fornecedor ainda enxerga a agenda inteira (a capacidade é única da cooperativa). Separar por fornecedor exigiria vincular o usuário a um cadastro de fornecedor.</p></div></div>';
}

Object.assign(ACT,{
  sair:async()=>{try{await POST('/api/auth/logout');}catch(e){}sairDaTela('');},
  'trocar-senha'(){openTrocarSenha();},
  'ts-ok':async()=>{
    const a=$('#ts-atual').value,n=$('#ts-nova').value,r=$('#ts-rep').value;
    if(!a||!n){setMsg('#ts-msg','Preencha a senha atual e a nova.');return;}
    if(n!==r){setMsg('#ts-msg','A repetição não confere com a nova senha.');return;}
    try{await POST('/api/auth/senha',{atual:a,nova:n});}catch(e){setMsg('#ts-msg',errTxt(e));return;}
    closeAll();toast('Senha alterada. As outras sessões foram encerradas.');
  },
  'nu-criar':async()=>{
    const login=$('#nu-login').value.trim(),nome=$('#nu-nome').value.trim(),papel=$('#nu-papel').value,senha=$('#nu-senha').value;
    if(!login||!nome||!senha){setMsg('#nu-msg','Preencha usuário, nome e senha inicial.');return;}
    try{await POST('/api/usuarios',{login,nome,papel,senha});}catch(e){setMsg('#nu-msg',errTxt(e));return;}
    await carregarUsuarios();toast('Usuário criado.');
  },
  'nu-ativo':async t=>{
    try{await POST('/api/usuarios/'+t.dataset.id+'/ativo',{ativo:t.dataset.ativo==='1'});}catch(e){toast(errTxt(e),true);return;}
    await carregarUsuarios();toast(t.dataset.ativo==='1'?'Usuário reativado.':'Usuário desativado e sessões encerradas.');
  },
  'nu-senha'(t){
    modal('Redefinir senha de '+esc(t.dataset.nome),'<label class="f">Nova senha <span class="hint">de 8 a 100 caracteres</span><input type="password" id="rs-nova" autocomplete="new-password"></label><div id="rs-msg" class="errs"></div><p class="hint">As sessões abertas dessa pessoa são encerradas.</p>',
      '<button class="btn" data-act="close-dlg">Cancelar</button><button class="btn primary" data-act="rs-ok" data-id="'+t.dataset.id+'">Redefinir</button>');
  },
  'rs-ok':async t=>{
    const n=$('#rs-nova').value;if(!n){setMsg('#rs-msg','Informe a nova senha.');return;}
    try{await POST('/api/usuarios/'+t.dataset.id+'/senha',{nova:n});}catch(e){setMsg('#rs-msg',errTxt(e));return;}
    closeAll();toast('Senha redefinida.');
  }
});
VIEWS.usuarios=viewUsuarios;
