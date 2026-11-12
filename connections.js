const byId=id=>document.getElementById(id);
const client=window.supabase?.createClient(window.REALCHECK_SUPABASE_CONFIG?.url,window.REALCHECK_SUPABASE_CONFIG?.publishableKey);
function showMessage(text){byId("connectionsMessage").textContent=text;}
async function loadConnections(){
 if(!client){showMessage("Account service is unavailable. Refresh and try again.");return;}
 const {data:sessionData}=await client.auth.getSession();
 if(!sessionData.session){byId("connectionCount").textContent="0";showMessage("Please log in to view your connections.");return;}
 const {data,error}=await client.rpc("list_realcheck_connections");
 if(error){byId("connectionCount").textContent="—";showMessage("Could not load connections. Please check the connection setup and refresh.");return;}
 const rows=data||[];byId("connectionCount").textContent=String(rows.length);
 const root=byId("connectionsList");root.replaceChildren();
 if(!rows.length){showMessage("You don't have any accepted connections yet. Discover members and send a connection request to get started.");return;}
 showMessage("");
 rows.forEach(person=>{
  const card=document.createElement("article");card.className="connection-member-card";
  const img=document.createElement("img");img.className="connection-member-avatar";img.src=person.avatar_url||"icon.svg";img.alt="";img.loading="lazy";
  const info=document.createElement("div");info.className="connection-member-info";
  const name=document.createElement("h3");name.textContent=person.display_name||"REALCHECK member";
  const username=document.createElement("p");username.className="connection-member-username";username.textContent="@"+(person.username||"");
  const headline=document.createElement("p");headline.className="connection-member-headline";headline.textContent=person.headline||"REALCHECK member";
  info.append(name,username,headline);
  if(person.is_verified===true){const verified=document.createElement("span");verified.className="preview-verified";verified.textContent="✓ Verified";info.append(verified);}
  const actions=document.createElement("div");actions.className="connection-member-actions";
  const profile=document.createElement("a");profile.className="btn btn-quiet";profile.href="member.html?username="+encodeURIComponent(person.username||"");profile.textContent="View profile ↗";
  actions.append(profile);card.append(img,info,actions);root.append(card);
 });
}
loadConnections();