const el=id=>document.getElementById(id);
const supabaseClient=window.supabase?.createClient(window.REALCHECK_SUPABASE_CONFIG?.url,window.REALCHECK_SUPABASE_CONFIG?.publishableKey);
async function loadConversations(){
 if(!supabaseClient){el("messagesStatus").textContent="Messaging service is unavailable.";return;}
 const {data:sessionData}=await supabaseClient.auth.getSession();
 if(!sessionData.session){el("messagesStatus").textContent="Please log in to view your messages.";return;}
 const {data,error}=await supabaseClient.rpc("list_realcheck_conversations");
 if(error){el("messagesStatus").textContent="Could not load conversations. Refresh and try again.";return;}
 const {data:passedSessions}=await supabaseClient.from("realcheck_pose_sessions").select("conversation_id").eq("status","passed");
 const unlocked=new Set((passedSessions||[]).map(row=>row.conversation_id));
 const root=el("conversationList");root.replaceChildren();
 if(!data?.length){el("messagesStatus").textContent="No conversations yet. Open a connection and select Message to start one.";return;}
 el("messagesStatus").textContent="";
 data.forEach(item=>{
  const canChat=unlocked.has(item.conversation_id);
  const link=document.createElement("a");link.className="conversation-item";link.href="chat.html?id="+encodeURIComponent(item.conversation_id);
  const avatar=document.createElement("img");avatar.className="conversation-avatar";avatar.src=item.avatar_url||"icon.svg";avatar.alt="";
  const info=document.createElement("div");info.className="conversation-info";
  const name=document.createElement("strong");name.textContent=item.display_name||"REALCHECK member";
  const preview=document.createElement("p");preview.textContent=canChat?(item.last_message||"Start a conversation"):"Complete mutual photo verification to unlock chat";
  info.append(name,preview);
  const time=document.createElement("time");time.textContent=canChat&&item.last_message_at?new Date(item.last_message_at).toLocaleDateString():"Verify";
  link.append(avatar,info,time);root.append(link);
 });
}
loadConversations();
