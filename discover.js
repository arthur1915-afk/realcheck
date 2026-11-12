const byId=id=>document.getElementById(id);
const client=window.supabase?.createClient(window.REALCHECK_SUPABASE_CONFIG?.url,window.REALCHECK_SUPABASE_CONFIG?.publishableKey);
let searchTimer=null;
function message(text){byId("discoverMessage").textContent=text;}
function renderMembers(rows){
 const root=byId("memberResults");root.replaceChildren();
 if(!rows.length){message("No discoverable members matched that search.");return;}
 message(rows.length+" member"+(rows.length===1?"":"s")+" found.");
 rows.forEach(person=>{
  const card=document.createElement("article");card.className="member-result-card";
  const img=document.createElement("img");img.className="member-result-avatar";img.src=person.avatar_url||"icon.svg";img.alt="";img.loading="lazy";
  const details=document.createElement("div");details.className="member-result-details";
  const name=document.createElement("div");name.className="member-result-name";name.textContent=person.display_name||"REALCHECK member";
  const username=document.createElement("div");username.className="member-result-username";username.textContent="@"+(person.username||"");
  const headline=document.createElement("p");headline.className="member-result-headline";headline.textContent=person.headline||person.occupation||"REALCHECK member";
  details.append(name,username,headline);
  if(person.is_verified===true){const verified=document.createElement("span");verified.className="preview-verified";verified.textContent="✓ Verified";details.append(verified);}
  const link=document.createElement("a");link.className="btn btn-quiet member-result-link";link.textContent="View profile ↗";link.href="member.html?username="+encodeURIComponent(person.username||"");
  card.append(img,details,link);root.append(card);
 });
}
async function search(){
 const query=byId("memberSearch").value.trim();
 if(query.length<2){byId("memberResults").replaceChildren();message("Enter at least 2 characters.");return;}
 if(!client){message("Account service is unavailable. Refresh and try again.");return;}
 const {data:sessionData}=await client.auth.getSession();
 if(!sessionData.session){message("Please log in to discover REALCHECK members.");return;}
 byId("searchBtn").disabled=true;message("Searching members…");
 try{const {data,error}=await client.rpc("search_realcheck_members",{p_query:query});if(error)throw error;renderMembers(data||[]);}
 catch(error){message("Search is temporarily unavailable. Please try again.");}
 finally{byId("searchBtn").disabled=false;}
}
byId("searchBtn").addEventListener("click",search);
byId("memberSearch").addEventListener("keydown",event=>{if(event.key==="Enter")search();});
