const joinDialog=document.querySelector("#joinDialog");
const infoDialog=document.querySelector("#infoDialog");
const authDialog=document.querySelector("#authDialog");
const profileDialog=document.querySelector("#profileDialog");
const authForm=document.querySelector("#authForm");
const authMessage=document.querySelector("#authMessage");
const profileForm=document.querySelector("#profileForm");
let authMode="signup";
let supabaseClient=null;
let currentUser=null;

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
function openAuth(mode="signup"){setAuthMode(mode);authDialog.showModal();}
["joinBtn","heroJoin","bottomJoin"].forEach(id=>document.getElementById(id).addEventListener("click",()=>openAuth("signup")));
document.getElementById("signInBtn").addEventListener("click",async()=>{
  if(!supabaseClient){showInfo("Setup required","The account service is not available. Please refresh and try again.");return;}
  if(currentUser){
    const {error}=await supabaseClient.auth.signOut();
    if(error) showInfo("Could not log out",error.message);
    return;
  }
  openAuth("login");
});
document.getElementById("profileBtn").addEventListener("click",openProfile);
document.getElementById("switchAuthMode").addEventListener("click",()=>setAuthMode(authMode==="signup"?"login":"signup"));
document.getElementById("phoneDemo").addEventListener("click",()=>showInfo("Demo profile","This is a fictional example used to demonstrate how a verified profile could look. No real identity check has taken place."));
document.getElementById("infoClose").addEventListener("click",()=>infoDialog.close());

function updateAuthButton(session){
  currentUser=session?.user||null;
  const button=document.getElementById("signInBtn");
  button.textContent=currentUser?"Log out":"Log in";
  button.setAttribute("aria-label",currentUser?"Log out of REALCHECK":"Log in to REALCHECK");
  document.getElementById("profileBtn").hidden=!currentUser;
}
async function openProfile(){
  if(!currentUser||!supabaseClient)return;
  const message=document.getElementById("profileMessage");
  message.textContent="Loading your profile…";
  profileDialog.showModal();
  const {data,error}=await supabaseClient.from("profiles")
    .select("display_name,username,bio")
    .eq("id",currentUser.id).maybeSingle();
  if(error){message.textContent="Could not load profile: "+error.message;return;}
  document.getElementById("profileDisplayName").value=data?.display_name||currentUser.user_metadata?.display_name||"";
  document.getElementById("profileUsername").value=data?.username||"";
  document.getElementById("profileBio").value=data?.bio||"";
  message.textContent="";
}
profileForm.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(!currentUser||!supabaseClient)return;
  const submit=document.getElementById("saveProfileBtn");
  const message=document.getElementById("profileMessage");
  const display_name=document.getElementById("profileDisplayName").value.trim();
  const username=document.getElementById("profileUsername").value.trim().toLowerCase();
  const bio=document.getElementById("profileBio").value.trim();
  submit.disabled=true;submit.textContent="Saving…";message.textContent="";
  try{
    const {error}=await supabaseClient.from("profiles").update({display_name,username,bio}).eq("id",currentUser.id);
    if(error)throw error;
    message.textContent="Profile saved successfully.";
  }catch(error){message.textContent=error.message||"Could not save your profile.";}
  finally{submit.disabled=false;submit.textContent="Save profile ↗";}
});

authForm.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(!supabaseClient){authMessage.textContent="Account service is not configured. Please refresh and try again.";return;}
  const email=document.getElementById("authEmail").value.trim();
  const password=document.getElementById("authPassword").value;
  const displayName=document.getElementById("authName").value.trim();
  const submit=document.getElementById("authSubmit");
  submit.disabled=true;submit.textContent=authMode==="signup"?"Creating account…":"Logging in…";authMessage.textContent="";
  try{
    if(authMode==="signup"){
      const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{display_name:displayName},emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error)throw error;
      if(data.session){
        updateAuthButton(data.session);
        authDialog.close();
        await openProfile();
      }else{
        authMessage.textContent="Account created. Check your email for the confirmation link before logging in.";
      }
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error)throw error;
      updateAuthButton(data.session);
      authDialog.close();
      await openProfile();
    }
    authForm.reset();
  }catch(error){authMessage.textContent=error.message||"Something went wrong. Please try again.";}
  finally{submit.disabled=false;submit.textContent=authMode==="signup"?"Create account ↗":"Log in ↗";}
});

if(window.supabase&&window.REALCHECK_SUPABASE_CONFIG?.url&&window.REALCHECK_SUPABASE_CONFIG?.publishableKey){
  supabaseClient=window.supabase.createClient(window.REALCHECK_SUPABASE_CONFIG.url,window.REALCHECK_SUPABASE_CONFIG.publishableKey);
  supabaseClient.auth.getSession().then(({data})=>updateAuthButton(data.session));
  supabaseClient.auth.onAuthStateChange((_event,session)=>updateAuthButton(session));
}else{console.error("REALCHECK Supabase configuration or SDK is missing.");}
if("serviceWorker"in navigator&&location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
