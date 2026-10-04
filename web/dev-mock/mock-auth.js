/* acrescenta login ao mock: usuários, sessão (sessionStorage), 401 e 403 pela mesma matriz de Permissoes.java */
(function(){
const USERS=[
 {id:1,login:'admin',nome:'Administrador',papel:'ADMIN',ativo:true,senha:'teste12345'},
 {id:2,login:'diretoria',nome:'Diretoria',papel:'DIRETORIA',ativo:true,senha:'teste12345'},
 {id:3,login:'compras',nome:'Setor de Compras',papel:'COMPRAS',ativo:true,senha:'teste12345'},
 {id:4,login:'armazem',nome:'Responsável pelo armazém',papel:'ARMAZEM',ativo:true,senha:'teste12345'},
 {id:5,login:'encarregado',nome:'Encarregado dos chapas',papel:'ENCARREGADO',ativo:true,senha:'teste12345'},
 {id:6,login:'fornecedor',nome:'Fornecedor (demonstração)',papel:'FORNECEDOR',ativo:true,senha:'teste12345'},
 {id:7,login:'porteiro',nome:'Portaria',papel:'PORTEIRO',ativo:true,senha:'teste12345'}];
const eu=()=>{try{return JSON.parse(sessionStorage.getItem('mock-eu')||'null');}catch(e){return null;}};
const PAINEL=['DIRETORIA','ARMAZEM'],BOL=['ENCARREGADO','ARMAZEM'],AG=['FORNECEDOR','ARMAZEM','PORTEIRO'],PORT=['PORTEIRO','ARMAZEM'];
function permite(papel,m,p){
  if(papel==='ADMIN')return true;if(p.startsWith('/api/auth/'))return true;if(p.startsWith('/api/usuarios'))return false;
  if(p.startsWith('/api/painel'))return PAINEL.includes(papel);
  if(p.startsWith('/api/portaria'))return PORT.includes(papel);
  if(m==='GET')return true;
  if(p.endsWith('/validacao-compras'))return papel==='COMPRAS';
  if(p.startsWith('/api/boletins'))return BOL.includes(papel);
  if(p==='/api/fornecedores'||p==='/api/agendamentos'||/^\/api\/agendamentos\/\d+\/notas\/\d+\/arquivo$/.test(p)||/^\/api\/agendamentos\/\d+\/(reagendamento|cancelamento)$/.test(p))return AG.includes(papel);
  return papel==='ARMAZEM';
}
const realFetch=window.fetch;
const J=(o,s=200)=>new Response(s===204?null:JSON.stringify(o),{status:s,headers:{'Content-Type':'application/problem+json'}});
const pessoa=u=>({id:u.id,login:u.login,nome:u.nome,papel:u.papel,autenticacaoAtiva:true});
let falhas=0;
window.fetch=async function(url,opt={}){
  const u=new URL(url,location.origin),p=u.pathname,m=(opt.method||'GET').toUpperCase();
  if(!p.startsWith('/api/'))return realFetch(url,opt);
  await new Promise(r=>setTimeout(r,20));
  const body=typeof opt.body==='string'?JSON.parse(opt.body):null;
  if(p==='/api/auth/login'){
    const x=USERS.find(a=>a.login===String(body.login||'').trim().toLowerCase());
    if(falhas>=5)return J({status:429,codigo:'MUITAS_TENTATIVAS',detail:'Muitas tentativas de entrada. Aguarde um minuto e tente de novo.'},429);
    if(!x||x.senha!==body.senha||!x.ativo){falhas++;return J({status:401,codigo:'CREDENCIAIS_INVALIDAS',detail:'Usuário ou senha incorretos.'},401);}
    falhas=0;sessionStorage.setItem('mock-eu',JSON.stringify(pessoa(x)));return J(pessoa(x));
  }
  if(p==='/api/auth/logout'){sessionStorage.removeItem('mock-eu');return J(null,204);}
  const e=eu();
  if(!e)return J({status:401,codigo:'NAO_AUTENTICADO',detail:'Entre com seu usuário e senha para continuar.'},401);
  if(!permite(e.papel,m,p))return J({status:403,codigo:'SEM_PERMISSAO',detail:'O seu perfil ('+e.papel+') não pode fazer esta ação.'},403);
  if(p==='/api/auth/me')return J(e);
  if(p==='/api/auth/senha'){const x=USERS.find(a=>a.id===e.id);if(x.senha!==body.atual)return J({status:422,codigo:'SENHA_ATUAL_INCORRETA',detail:'A senha atual não confere.'},422);if(!body.nova||body.nova.length<8)return J({status:422,codigo:'SENHA_FRACA',detail:'A senha precisa ter de 8 a 100 caracteres.'},422);x.senha=body.nova;return J(null,204);}
  if(p==='/api/usuarios'&&m==='GET')return J(USERS.map(x=>({id:x.id,login:x.login,nome:x.nome,papel:x.papel,ativo:x.ativo,criadoEm:'2026-10-01T10:00:00-03:00',ultimoAcessoEm:x.id===e.id?'2026-10-03T21:00:00-03:00':undefined})));
  if(p==='/api/usuarios'&&m==='POST'){if(USERS.some(x=>x.login===body.login))return J({status:409,codigo:'USUARIO_EXISTENTE',detail:'Já existe um usuário com este login.'},409);const n={id:USERS.length+1,login:body.login,nome:body.nome,papel:body.papel,ativo:true,senha:body.senha};USERS.push(n);return J(pessoa(n),201);}
  let mm;
  if(mm=p.match(/^\/api\/usuarios\/(\d+)\/ativo$/)){const x=USERS.find(a=>a.id===+mm[1]);if(x.id===e.id)return J({status:422,codigo:'AUTOBLOQUEIO',detail:'Você não pode desativar o seu próprio usuário.'},422);x.ativo=body.ativo;return J(null,204);}
  if(mm=p.match(/^\/api\/usuarios\/(\d+)\/senha$/)){USERS.find(a=>a.id===+mm[1]).senha=body.nova;return J(null,204);}
  return realFetch(url,opt);
};
})();
