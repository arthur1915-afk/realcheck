const joinDialog=document.querySelector("#joinDialog");
const infoDialog=document.querySelector("#infoDialog");
const authDialog=document.querySelector("#authDialog");
const authForm=document.querySelector("#authForm");
const authMessage=document.querySelector("#authMessage");
let authMode="signup";
let supabaseClient=null;

function showInfo(title,message){
  document.getElementById("infoTitle").textContent=title;
  document.getElementById("infoText").textContent=message;
  infoDialog.showModal();
}
function setAuthMode(mode){
  authMode=mode;
  const signup=mode==="signup";
  document.getElementById("authEyebrow").textContent=signup?"CREATE YOUR ACCOUNT":"WELCOME BACK";
  document.getElementById("authTitle").textContent=signup?"Join REALCHECK.":"Log in.";
  document.getElementById("authIntro").textContent=signup?"Create an account to begin building a more trustworthy profile.":"Sign in to continue to your REALCHECK account.";
  document.getElementById("authNameLabel").hidden=!signup;
  document.getElementById("authName").hidden=!signup;
  document.getElementById("authName").required=signup;
  document.getElementById("authPassword").autocomplete=signup?"new-password":"current-password";
  document.getElementById("authSubmit").textContent=signup?"Create account ↗":"Log in ↗";
  document.getElementById("authSwitchText").firstChild.textContent=signup?"Already have an account? ":"New to REALCHECK? ";
  document.getElementById("switchAuthMode").textContent=signup?"Log in":"Create account";
  authMessage.textContent="";
}
function openAuth(mode="signup"){
  setAuthMode(mode);
  authDialog.showModal();
}
["joinBtn","heroJoin","bottomJoin"].forEach(id=>document.getElementById(id).addEventListener("click",()=>openAuth("signup")));
document.getElementById("signInBtn").addEventListener("click",async()=>{
  if(!supabaseClient){showInfo("Setup required","The account service is not available yet. Please refresh the page and try again.");return;}
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(session){
    const {error}=await supabaseClient.auth.signOut();
    if(error) showInfo("Could not log out",error.message);
    else updateAuthButton(null);
  }else openAuth("login");
});
document.getElementById("switchAuthMode").addEventListener("click",()=>setAuthMode(authMode==="signup"?"login":"signup"));
document.getElementById("phoneDemo").addEventListener("click",()=>showInfo("Demo profile","This is a fictional example used to demonstrate how a verified profile could look. No real identity check has taken place."));
document.getElementById("infoClose").addEventListener("click",()=>infoDialog.close());

function updateAuthButton(session){
  const button=document.getElementById("signInBtn");
  button.textContent=session?"Log out":"Log in";
  button.setAttribute("aria-label",session?"Log out of REALCHECK":"Log in to REALCHECK");
}
authForm.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(!supabaseClient){authMessage.textContent="Account service is not configured. Please refresh and try again.";return;}
  const email=document.getElementById("authEmail").value.trim();
  const password=document.getElementById("authPassword").value;
  const displayName=document.getElementById("authName").value.trim();
  const submit=document.getElementById("authSubmit");
  submit.disabled=true;
  submit.textContent=authMode==="signup"?"Creating account…":"Logging in…";
  authMessage.textContent="";
  try{
    if(authMode==="signup"){
      const {data,error}=await supabaseClient.auth.signUp({
        email,password,
        options:{data:{display_name:displayName},emailRedirectTo:window.location.origin+window.location.pathname}
      });
      if(error) throw error;
      if(data.session){
        authMessage.textContent="Account created. You're signed in.";
        updateAuthButton(data.session);
      }else{
        authMessage.textContent="Account created. Check your email for the confirmation link before logging in.";
      }
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error) throw error;
      authMessage.textContent="You're signed in successfully.";
      updateAuthButton(data.session);
    }
    authForm.reset();
  }catch(error){
    authMessage.textContent=error.message||"Something went wrong. Please try again.";
  }finally{
    submit.disabled=false;
    submit.textContent=authMode==="signup"?"Create account ↗":"Log in ↗";
  }
});

if(window.supabase&&window.REALCHECK_SUPABASE_CONFIG?.url&&window.REALCHECK_SUPABASE_CONFIG?.publishableKey){
  supabaseClient=window.supabase.createClient(
    window.REALCHECK_SUPABASE_CONFIG.url,
    window.REALCHECK_SUPABASE_CONFIG.publishableKey
  );
  supabaseClient.auth.getSession().then(({data})=>updateAuthButton(data.session));
  supabaseClient.auth.onAuthStateChange((_event,session)=>updateAuthButton(session));
}else{
  console.error("REALCHECK Supabase configuration or SDK is missing.");
}

if("serviceWorker"in navigator&&location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
