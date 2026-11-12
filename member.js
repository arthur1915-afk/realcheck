const byId=id=>document.getElementById(id);
const client=window.supabase?.createClient(window.REALCHECK_SUPABASE_CONFIG?.url,window.REALCHECK_SUPABASE_CONFIG?.publishableKey);
function showError(message){byId("memberMessage").textContent=message;byId("memberMessage").hidden=false;byId("publicProfile").hidden=true;}
function setText(id,value,show=true){const el=byId(id);el.textContent=value||"";el.hidden=!show||!value;}
async function loadMember(){
 if(!client){showError("REALCHECK account service is unavailable. Please refresh and try again.");return;}
 const {data:sessionData}=await client.auth.getSession();
 if(!sessionData.session){showError("Please log in to view REALCHECK member profiles.");return;}
 const username=new URLSearchParams(location.search).get("username");
 if(!username){showError("No username was provided. Open a member profile using its profile link.");return;}
 const {data,error}=await client.rpc("get_realcheck_public_profile",{p_username:username});
 if(error){showError("We couldn't load this profile. Please try again later.");return;}
 const p=Array.isArray(data)?data[0]:data;
 if(!p){showError("This profile is unavailable or the member has chosen not to be discoverable.");return;}
 byId("memberName").textContent=p.display_name||"REALCHECK member";
 byId("memberUsername").textContent="@"+(p.username||username);
 byId("memberAvatar").src=p.avatar_url||"icon.svg";
 byId("memberAvatar").alt=(p.display_name||"Member")+" profile photo";
 byId("memberVerified").hidden=p.is_verified!==true;
 setText("memberHeadline",p.headline);
 setText("memberBio",p.bio||"This member hasn't added an introduction yet.");
 setText("memberLocation",p.location?"⌖ "+p.location:"");
 setText("memberOccupation",p.occupation?"▣ "+p.occupation:"");
 byId("memberDetails").hidden=!p.location&&!p.occupation;
 const interests=(p.interests||"").split(",").map(x=>x.trim()).filter(Boolean);
 byId("memberInterests").replaceChildren(...interests.map(x=>{const el=document.createElement("span");el.className="preview-tag";el.textContent=x;return el;}));
 byId("memberInterestSection").hidden=interests.length===0;
 setText("memberLanguages",p.languages||"");
 byId("memberLanguageSection").hidden=!p.languages;
 byId("memberMessage").hidden=true;byId("publicProfile").hidden=false;
 byId("sendConnectionBtn").hidden=p.id===sessionData.session.user.id;
 byId("sendConnectionBtn").dataset.username=p.username||username;
}
loadMember();

byId("sendConnectionBtn").addEventListener("click",async()=>{const button=byId("sendConnectionBtn");button.disabled=true;byId("connectionMessage").textContent="Sending request…";try{const {data,error}=await client.rpc("send_realcheck_connection_request",{p_username:button.dataset.username});if(error)throw error;button.textContent=data==="connected"?"Already connected":data==="pending"?"Request already pending":"Request sent ✓";byId("connectionMessage").textContent=data==="sent"?"Your connection request has been sent.":data==="pending"?"A connection request is already pending.":"You are already connected."; }catch(e){byId("connectionMessage").textContent=e.message||"Could not send request.";button.disabled=false;}});
