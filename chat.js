const el=id=>document.getElementById(id);
const supabaseClient=window.supabase?.createClient(window.REALCHECK_SUPABASE_CONFIG?.url,window.REALCHECK_SUPABASE_CONFIG?.publishableKey);
const conversationId=new URLSearchParams(location.search).get("id");
let currentUserId=null,channel=null;

function status(message){el("chatStatus").textContent=message||"";}

function addMessage(message){
 if(!message?.id || el("chatMessages").querySelector('[data-message-id="'+CSS.escape(String(message.id))+'"]'))return;
 const mine=message.sender_id===currentUserId;
 const bubble=document.createElement("article");
 bubble.className="chat-bubble "+(mine?"mine":"theirs");
 bubble.dataset.messageId=String(message.id);
 const body=document.createElement("p");body.textContent=message.body??"";
 const time=document.createElement("time");
 time.textContent=message.created_at?new Date(message.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"";
 bubble.append(body,time);el("chatMessages").append(bubble);
}

function renderMessages(messages){
 const root=el("chatMessages");
 root.replaceChildren();
 (messages||[]).forEach(addMessage);
 root.scrollTop=root.scrollHeight;
}

async function refreshMessages({quiet=false}={}){
 const {data,error}=await supabaseClient.from("realcheck_messages")
  .select("id,conversation_id,sender_id,body,created_at")
  .eq("conversation_id",conversationId)
  .order("created_at",{ascending:true})
  .limit(500);
 if(error){
  if(!quiet)status("Your message may have been sent, but chat history could not be loaded. Please refresh. ("+error.message+")");
  return false;
 }
 renderMessages(data||[]);
 return true;
}

async function loadChat(){
 if(!supabaseClient||!conversationId){status("This conversation link is invalid.");return;}
 const {data:sessionData,error:sessionError}=await supabaseClient.auth.getSession();
 if(sessionError||!sessionData.session){status("Please log in to open this conversation.");return;}
 currentUserId=sessionData.session.user.id;
 const {data:conversation,error:conversationError}=await supabaseClient.from("realcheck_conversations")
  .select("id,participant_a,participant_b").eq("id",conversationId).maybeSingle();
 if(conversationError||!conversation){status("This conversation is unavailable. You must still be connected to this member.");return;}
 const {data:profileData,error:profileError}=await supabaseClient.rpc("get_realcheck_conversation_member",{p_conversation_id:conversationId});
 const profile=Array.isArray(profileData)?profileData[0]:profileData;
 el("chatMemberName").textContent=profile?.display_name||"REALCHECK member";
 el("chatMemberUsername").textContent=profile?.username?"@"+profile.username:"";
 if(profileError)status("Chat opened, but member details could not be loaded.");
 const loaded=await refreshMessages();
 if(!loaded)return;
 channel=supabaseClient.channel("realcheck-chat-"+conversationId)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"realcheck_messages",filter:"conversation_id=eq."+conversationId},payload=>{
   addMessage(payload.new);
   el("chatMessages").scrollTop=el("chatMessages").scrollHeight;
  }).subscribe();
}

el("chatForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const button=el("sendMessageBtn");
 const input=el("messageInput");
 const body=input.value.trim();
 if(!body||!currentUserId||button.disabled)return;
 button.disabled=true;status("Sending…");
 const {data,error}=await supabaseClient.from("realcheck_messages")
  .insert({conversation_id:conversationId,sender_id:currentUserId,body})
  .select("id,conversation_id,sender_id,body,created_at")
  .maybeSingle();
 button.disabled=false;
 if(error){
  status("Message could not be saved: "+error.message);
  return;
 }
 input.value="";
 if(data){
  addMessage(data);
  el("chatMessages").scrollTop=el("chatMessages").scrollHeight;
  status("Message sent.");
 }else{
  status("Message submitted, but its saved record was not returned. Refreshing chat history…");
 }
 const refreshed=await refreshMessages({quiet:true});
 if(!refreshed)status("Message submitted, but chat history could not be refreshed. Your message may still be saved.");
 else status("Message sent.");
});

window.addEventListener("beforeunload",()=>{if(channel)supabaseClient.removeChannel(channel);});
loadChat();