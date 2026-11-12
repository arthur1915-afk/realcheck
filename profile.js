let client=null,user=null;
const byId=id=>document.getElementById(id);
const verificationDialog=byId("verificationDialog");
const verificationMessage=byId("verificationMessage");
const verifyBtn=byId("verifyBtn");
function showStatus(status){
  const symbol=byId("verificationSymbol"),result=byId("verificationResult"),description=byId("verificationDescription");
  if(status==="verified"){byId("previewVerified").hidden=false;symbol.textContent="✓";symbol.classList.add("is-verified");result.textContent="Identity verified";description.textContent="Your identity check has been successfully completed. Your REALCHECK account is verified.";verifyBtn.hidden=true;}
  else if(status==="rejected"){byId("previewVerified").hidden=true;symbol.textContent="!";result.textContent="Verification not approved";description.textContent="Your latest identity check was not approved. You can review the process and try again.";verifyBtn.hidden=false;}
  else if(status){byId("previewVerified").hidden=true;symbol.textContent="◷";result.textContent="Under review";description.textContent="Your identity check has been submitted and is awaiting a final result.";verifyBtn.hidden=true;}
  else{byId("previewVerified").hidden=true;symbol.textContent="◉";result.textContent="Not verified yet";description.textContent="Complete an identity check to add a verified status to your REALCHECK account.";verifyBtn.hidden=false;}
}
function updateBioCount(){byId("bioCount").textContent=String(byId("bio").value.length);}
byId("bio").addEventListener("input",updateBioCount);

function updateProfilePreview(){
 const val=id=>byId(id).value.trim();
 byId("previewName").textContent=val("displayName")||"Your name";
 byId("previewUsername").textContent=val("username")?"@"+val("username").replace(/^@/,""):"@username";
 byId("previewHeadline").textContent=val("headline");byId("previewHeadline").hidden=!val("headline");
 byId("previewBio").textContent=val("bio")||"Your introduction will appear here.";
 const setMeta=(id,value)=>{const el=byId(id);el.querySelector("span").textContent=value;el.hidden=!value;};
 setMeta("previewLocation",byId("showLocation").checked?val("location"):"");setMeta("previewOccupation",val("occupation"));
 const tags=val("interests").split(",").map(x=>x.trim()).filter(Boolean);
 byId("previewInterests").replaceChildren(...tags.map(tag=>{const span=document.createElement("span");span.className="preview-tag";span.textContent=tag;return span;}));
 const langs=val("languages");byId("previewLanguages").textContent=langs?"Languages · "+langs:"";byId("previewLanguages").hidden=!langs;
}
["displayName","username","headline","bio","location","occupation","interests","languages","showLocation"].forEach(id=>byId(id).addEventListener("input",updateProfilePreview));

async function loadProfile(){
 const {data,error}=await client.from("profiles").select("display_name,username,bio,avatar_url,headline,location,occupation,interests,languages,is_public,show_location").eq("id",user.id).maybeSingle();
 if(error){byId("profileMessage").textContent="Could not load your profile: "+error.message;return;}
 byId("displayName").value=data?.display_name||user.user_metadata?.display_name||"";
 byId("username").value=data?.username||"";
 byId("bio").value=data?.bio||"";
 byId("headline").value=data?.headline||"";
 byId("location").value=data?.location||"";
 byId("occupation").value=data?.occupation||"";
 byId("interests").value=data?.interests||"";
 byId("languages").value=data?.languages||"";
 byId("profileDiscoverable").checked=data?.is_public!==false;
 byId("showLocation").checked=data?.show_location===true;
 updateBioCount();
 updateProfilePreview();
 const avatar=data?.avatar_url||"";
 if(avatar){byId("previewAvatar").src=avatar;byId("avatarPreview").src=avatar;byId("removeAvatarBtn").hidden=false;}
 else{byId("previewAvatar").src="icon.svg";byId("avatarPreview").src="icon.svg";byId("removeAvatarBtn").hidden=true;}
 const {data:verification,error:verificationError}=await client.from("identity_verifications").select("status,verified_at").eq("user_id",user.id).eq("provider","sumsub").maybeSingle();
 if(verificationError){byId("verificationResult").textContent="Status unavailable";byId("verificationDescription").textContent="We couldn't retrieve your verification status. Please refresh and try again.";verifyBtn.hidden=true;return;}
 showStatus(verification?.status||null);
}
byId("profileForm").addEventListener("submit",async e=>{
 e.preventDefault();const btn=byId("saveBtn"),message=byId("profileMessage");btn.disabled=true;btn.textContent="Saving…";message.textContent="";
 try{const {error}=await client.from("profiles").update({display_name:byId("displayName").value.trim(),username:byId("username").value.trim().toLowerCase(),bio:byId("bio").value.trim(),headline:byId("headline").value.trim(),location:byId("location").value.trim(),occupation:byId("occupation").value.trim(),interests:byId("interests").value.trim(),languages:byId("languages").value.trim(),is_public:byId("profileDiscoverable").checked,show_location:byId("showLocation").checked}).eq("id",user.id);if(error)throw error;message.textContent="Your profile has been saved.";}
 catch(err){message.textContent=err.message||"Could not save your profile.";}
 finally{btn.disabled=false;btn.textContent="Save changes ↗";}
});

byId("avatarInput").addEventListener("change",async event=>{
 const file=event.target.files?.[0];if(!file)return;
 const message=byId("profileMessage");
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)){message.textContent="Please choose a JPG, PNG or WebP image.";event.target.value="";return;}
 if(file.size>5*1024*1024){message.textContent="Your photo must be 5 MB or smaller.";event.target.value="";return;}
 const input=byId("avatarInput");input.disabled=true;message.textContent="Uploading your profile photo…";
 const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
 const path=user.id+"/avatar."+extension;
 try{
  const {error:uploadError}=await client.storage.from("profile-photos").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
  if(uploadError)throw uploadError;
  const {data:publicData}=client.storage.from("profile-photos").getPublicUrl(path);
  const {error:updateError}=await client.from("profiles").update({avatar_url:publicData.publicUrl}).eq("id",user.id);
  if(updateError)throw updateError;
  byId("avatarPreview").src=publicData.publicUrl+"?v="+Date.now();byId("previewAvatar").src=publicData.publicUrl+"?v="+Date.now();
  byId("removeAvatarBtn").hidden=false;message.textContent="Profile photo updated successfully.";
 }catch(err){message.textContent=err.message||"Could not upload your photo. Check the storage setup and try again.";}
 finally{input.disabled=false;event.target.value="";}
});
byId("removeAvatarBtn").addEventListener("click",async()=>{
 const button=byId("removeAvatarBtn"),message=byId("profileMessage");button.disabled=true;message.textContent="Removing photo…";
 try{
  const {data}=await client.from("profiles").select("avatar_url").eq("id",user.id).maybeSingle();
  if(data?.avatar_url){
   const marker="/storage/v1/object/public/profile-photos/";
   const index=data.avatar_url.indexOf(marker);
   if(index>=0){const path=decodeURIComponent(data.avatar_url.slice(index+marker.length).split("?")[0]);const {error}=await client.storage.from("profile-photos").remove([path]);if(error)throw error;}
  }
  const {error:updateError}=await client.from("profiles").update({avatar_url:null}).eq("id",user.id);if(updateError)throw updateError;
  byId("avatarPreview").src="icon.svg";byId("previewAvatar").src="icon.svg";button.hidden=true;message.textContent="Profile photo removed.";
 }catch(err){message.textContent=err.message||"Could not remove photo.";}
 finally{button.disabled=false;}
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
