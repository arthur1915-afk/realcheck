let client=null,user=null;
const byId=id=>document.getElementById(id);
const verificationDialog=byId("verificationDialog");
const verificationMessage=byId("verificationMessage");
const verifyBtn=byId("verifyBtn");
function showStatus(status){
  const symbol=byId("verificationSymbol"),result=byId("verificationResult"),description=byId("verificationDescription");
  if(status==="verified"){symbol.textContent="✓";symbol.classList.add("is-verified");result.textContent="Identity verified";description.textContent="Your identity check has been successfully completed. Your REALCHECK account is verified.";verifyBtn.hidden=true;}
  else if(status==="rejected"){symbol.textContent="!";result.textContent="Verification not approved";description.textContent="Your latest identity check was not approved. You can review the process and try again.";verifyBtn.hidden=false;}
  else if(status){symbol.textContent="◷";result.textContent="Under review";description.textContent="Your identity check has been submitted and is awaiting a final result.";verifyBtn.hidden=true;}
  else{symbol.textContent="◉";result.textContent="Not verified yet";description.textContent="Complete an identity check to add a verified status to your REALCHECK account.";verifyBtn.hidden=false;}
}
async function loadProfile(){
 const {data,error}=await client.from("profiles").select("display_name,username,bio").eq("id",user.id).maybeSingle();
 if(error){byId("profileMessage").textContent="Could not load your profile: "+error.message;return;}
 byId("displayName").value=data?.display_name||user.user_metadata?.display_name||"";
 byId("username").value=data?.username||"";
 byId("bio").value=data?.bio||"";
 byId("avatarInitial").textContent=(data?.display_name||user.email||"R").trim().charAt(0).toUpperCase();
 const {data:verification,error:verificationError}=await client.from("identity_verifications").select("status,verified_at").eq("user_id",user.id).eq("provider","sumsub").maybeSingle();
 if(verificationError){byId("verificationResult").textContent="Status unavailable";byId("verificationDescription").textContent="We couldn't retrieve your verification status. Please refresh and try again.";verifyBtn.hidden=true;return;}
 showStatus(verification?.status||null);
}
byId("profileForm").addEventListener("submit",async e=>{
 e.preventDefault();const btn=byId("saveBtn"),message=byId("profileMessage");btn.disabled=true;btn.textContent="Saving…";message.textContent="";
 try{const {error}=await client.from("profiles").update({display_name:byId("displayName").value.trim(),username:byId("username").value.trim().toLowerCase(),bio:byId("bio").value.trim()}).eq("id",user.id);if(error)throw error;message.textContent="Your profile has been saved.";byId("avatarInitial").textContent=byId("displayName").value.trim().charAt(0).toUpperCase();}
 catch(err){message.textContent=err.message||"Could not save your profile.";}
 finally{btn.disabled=false;btn.textContent="Save changes ↗";}
});
byId("logoutBtn").addEventListener("click",async()=>{await client.auth.signOut();location.href="./";});
async function getToken(){const {data,error}=await client.functions.invoke("sumsub-create-applicant",{body:{}});if(error)throw new Error(error.message);if(!data?.accessToken)throw new Error(data?.error||"No verification token returned.");return data.accessToken;}
verifyBtn.addEventListener("click",async()=>{
 if(typeof snsWebSdk==="undefined"){verificationMessage.textContent="Verification service has not loaded. Refresh and try again.";verificationDialog.showModal();return;}
 verifyBtn.disabled=true;verifyBtn.textContent="Preparing…";
 try{const token=await getToken();byId("sumsub-websdk-container").replaceChildren();verificationDialog.showModal();
 const sdk=snsWebSdk.init(token,()=>getToken()).withConf({lang:"en",theme:"dark"}).withOptions({addViewportTag:false,adaptIframeHeight:true})
 .on("idCheck.onApplicantSubmitted",()=>{verificationMessage.textContent="Submitted for review. Your verified status will update after REALCHECK receives the secure result.";})
 .on("idCheck.onError",()=>{verificationMessage.textContent="Sumsub reported an issue. Follow its instructions and try again.";}).build();
 sdk.launch("#sumsub-websdk-container");
 }catch(err){verificationMessage.textContent=err.message||"Could not start verification.";verificationDialog.showModal();}
 finally{verifyBtn.disabled=false;verifyBtn.textContent="Start identity verification ↗";}
});
verificationDialog.addEventListener("close",()=>byId("sumsub-websdk-container").replaceChildren());
if(window.supabase&&window.REALCHECK_SUPABASE_CONFIG?.url&&window.REALCHECK_SUPABASE_CONFIG?.publishableKey){
 client=window.supabase.createClient(window.REALCHECK_SUPABASE_CONFIG.url,window.REALCHECK_SUPABASE_CONFIG.publishableKey);
 client.auth.getSession().then(async({data})=>{user=data.session?.user;if(!user){location.href="./";return;}await loadProfile();});
 client.auth.onAuthStateChange((_event,session)=>{if(!session){location.href="./";}});
}else{byId("profileMessage").textContent="Account service unavailable. Refresh and try again.";}
