const el=id=>document.getElementById(id);
const supabaseClient=window.supabase?.createClient(window.REALCHECK_SUPABASE_CONFIG?.url,window.REALCHECK_SUPABASE_CONFIG?.publishableKey);
const conversationId=new URLSearchParams(location.search).get("id");
let currentUserId=null,channel=null;
function status(text){el("chatStatus").textContent=text||"";}
function addMessage(message){
 const mine=message.sender_id===currentUserId;
 const bubble=document.createElement("article");bubble.className="chat-bubble "+(mine?"mine":"theirs");
 const body=document.createElement("p");body.textContent=message.body;
 const time=document.createElement("time");time.textContent=new Date(message.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
 bubble.append(body,time);el("chatMessages").append(bubble);
}
async function loadChat(){
 if(!supabaseClient||!conversationId){status("This conversation link is invalid.");return;}
 const {data:sessionData}=await supabaseClient.auth.getSession();
 if(!sessionData.session){status("Please log in to open this conversation.");return;}
 currentUserId=sessionData.session.user.id;
 const {data:conversation,error:conversationError}=await supabaseClient.from("realcheck_conversations").select("id,participant_a,participant_b").eq("id",conversationId).maybeSingle();
 if(conversationError||!conversation){status("This conversation is unavailable. You must still be connected to this member.");return;}
 const otherId=conversation.participant_a===currentUserId?conversation.participant_b:conversation.participant_a;
 const {data:profile}=await supabaseClient.from("profiles").select("display_name,username").eq("id",otherId).maybeSingle();
 el("chatMemberName").textContent=profile?.display_name||"REALCHECK member";
 el("chatMemberUsername").textContent=profile?.username?"@"+profile.username:"";
 const {data:messages,error}=await supabaseClient.from("realcheck_messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",conversationId).order("created_at",{ascending:true}).limit(500);
 if(error){status("Could not load messages. Please refresh.");return;}
 el("chatMessages").replaceChildren();(messages||[]).forEach(addMessage);el("chatMessages").scrollTop=el("chatMessages").scrollHeight;
 channel=supabaseClient.channel("realcheck-chat-"+conversationId).on("postgres_changes",{event:"INSERT",schema:"public",table:"realcheck_messages",filter:"conversation_id=eq."+conversationId},payload=>{
  if(payload.new.sender_id!==currentUserId)addMessage(payload.new);
  el("chatMessages").scrollTop=el("chatMessages").scrollHeight;
 }).subscribe();
}
el("chatForm").addEventListener("submit",async event=>{
 event.preventDefault();const button=el("sendMessageBtn");const body=el("messageInput").value.trim();
 if(!body||!currentUserId)return;
 button.disabled=true;status("Sending…");
 const {error}=await supabaseClient.from("realcheck_messages").insert({conversation_id:conversationId,sender_id:currentUserId,body});
 button.disabled=false;
 if(error){status("Message could not be sent. You may no longer be connected.");return;}
 el("messageInput").value="";status("");const {data}=await supabaseClient.from("realcheck_messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",conversationId).order("created_at",{ascending:false}).limit(1);
 if(data?.[0]){const root=el("chatMessages");root.replaceChildren();const {data:all}=await supabaseClient.from("realcheck_messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",conversationId).order("created_at",{ascending:true}).limit(500);(all||[]).forEach(addMessage);root.scrollTop=root.scrollHeight;}
});
window.addEventListener("beforeunload",()=>{if(channel)supabaseClient.removeChannel(channel);});
loadChat();