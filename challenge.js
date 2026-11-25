const el=id=>document.getElementById(id);
const client=window.supabase?.createClient(window.REALCHECK_SUPABASE_CONFIG?.url,window.REALCHECK_SUPABASE_CONFIG?.publishableKey);
const conversationId=new URLSearchParams(location.search).get("id");
const bucket="realcheck-challenge-photos";
let user=null,attempt=null,stream=null,timerHandle=null,pollHandle=null,reviewing=false,pendingUpload=null;

function message(text){el("poseStatus").textContent=text;}
function stopCamera(){if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}el("poseVideo").srcObject=null;}
function hideSections(){["poseChallenge","poseReview","poseWaiting"].forEach(id=>el(id).hidden=true);}
async function signedPhoto(path){const {data,error}=await client.storage.from(bucket).createSignedUrl(path,90);if(error)throw error;return data.signedUrl;}

async function loadAttempt(){
 const {data,error}=await client.rpc("begin_realcheck_pose_challenge",{p_conversation_id:conversationId});
 if(error)throw error;
 if(data.status==="passed"){
  stopCamera();hideSections();message("Both participants approved. Your private chat is unlocked.");el("returnToChat").href="./chat.html?id="+encodeURIComponent(conversationId);el("returnToChat").hidden=false;return;
 }
 if(data.status==="failed"){
  stopCamera();hideSections();message(data.message||"The challenge is complete. Chat remains locked.");return;
 }
 if(data.status==="waiting_for_partner"){
  attempt=data;stopCamera();hideSections();el("poseWaiting").hidden=false;
  el("poseWaiting").querySelector("h2").textContent="Waiting for your connection";
  el("poseWaiting").querySelector("p").textContent="You're ready. The 20-second timer will begin only when both participants have opened this attempt.";
  message(data.message||"Waiting for the other participant to join.");
  return;
 }
 attempt=data;
 el("poseWaiting").querySelector("h2").textContent="Waiting for the other review";
 el("poseWaiting").querySelector("p").textContent="Your photo has been submitted. Chat remains locked until both people approve the other's photo.";
 el("poseAttempt").textContent="ATTEMPT "+data.attempt+" OF 3";
 el("posePrompt").textContent=data.prompt;
 const remaining=Math.max(0,Math.ceil((new Date(data.expires_at).getTime()-Date.now())/1000));
 el("poseTimer").textContent=String(remaining);
 if(timerHandle)clearInterval(timerHandle);
 timerHandle=setInterval(()=>{const left=Math.max(0,Math.ceil((new Date(data.expires_at).getTime()-Date.now())/1000));el("poseTimer").textContent=String(left);if(left<=0){clearInterval(timerHandle);refreshState().catch(e=>message(e.message));}},250);
 const {data:mine,error:mineError}=await client.from("realcheck_pose_submissions").select("id,photo_path,review_status").eq("attempt_id",data.attempt_id).eq("user_id",user.id).maybeSingle();
 if(mineError)throw mineError;
 const {data:other,error:otherError}=await client.from("realcheck_pose_submissions").select("id,photo_path,review_status").eq("attempt_id",data.attempt_id).neq("user_id",user.id).maybeSingle();
 if(otherError)throw otherError;
 if(mine){
  stopCamera();hideSections();
  if(other && other.review_status==="pending" && !reviewing){
   const url=await signedPhoto(other.photo_path);el("otherSubmissionPhoto").src=url;el("poseReview").hidden=false;el("approvePose").dataset.submissionId=other.id;el("rejectPose").dataset.submissionId=other.id;
   message("Both photos are submitted. Review your connection's photo.");
  }else{
   el("poseWaiting").hidden=false;
   message("Your photo is submitted. Waiting for your connection to submit and review.");
  }
 }else{
  hideSections();el("poseChallenge").hidden=false;
  message("Complete this pose before the 20-second timer expires.");
  if(!stream)await startCamera();
 }
}

async function startCamera(){
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});el("poseVideo").srcObject=stream;}
 catch(error){message("Camera access is required for this challenge. Allow camera access and reload. "+(error.message||""));}
}

async function refreshState(){
 if(!user)return;
 if(!attempt){await loadAttempt();return;}
 const {data:session,error}=await client.from("realcheck_pose_sessions").select("status,current_attempt").eq("conversation_id",conversationId).maybeSingle();
 if(error)throw error;
 if(session?.status==="passed"){await loadAttempt();return;}
 if(session?.status==="failed"){await loadAttempt();return;}
 const {data:current,error:attemptError}=await client.from("realcheck_pose_attempts").select("id,attempt_number,status").eq("session_id",attempt.session_id).eq("status","active").maybeSingle();
 if(attemptError)throw attemptError;
 if(current && current.id!==attempt.attempt_id){stopCamera();attempt=null;await loadAttempt();return;}
 await loadAttempt();
}

el("capturePose").addEventListener("click",async()=>{
 const button=el("capturePose");if(button.disabled||!attempt)return;
 button.disabled=true;button.textContent=pendingUpload?"Retrying upload…":"Submitting…";
 try{
  if(!pendingUpload){
   if(!stream)throw new Error("Camera is not ready. Please allow camera access and try again.");
   if(Date.now()>=new Date(attempt.expires_at).getTime()){message("Time expired. Preparing the next attempt…");await refreshState();return;}
   const video=el("poseVideo"),canvas=el("poseCanvas");
   if(!video.videoWidth)throw new Error("Camera is not ready. Please wait a moment.");
   const width=Math.min(video.videoWidth,1280),height=Math.round(video.videoHeight*(width/video.videoWidth));
   canvas.width=width;canvas.height=height;canvas.getContext("2d").drawImage(video,0,0,width,height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.84));
   if(!blob)throw new Error("Could not capture the photo.");
   const path=user.id+"/"+attempt.session_id+"/"+attempt.attempt_id+"/"+crypto.randomUUID()+".jpg";
   const {error:registerError}=await client.rpc("register_realcheck_pose_submission",{p_attempt_id:attempt.attempt_id,p_photo_path:path});
   if(registerError)throw registerError;
   // Keep the same path and captured blob so a transient storage failure can be retried
   // without creating a duplicate submission row or taking another photo.
   pendingUpload={path,blob,attemptId:attempt.attempt_id};
  }
  if(pendingUpload.attemptId!==attempt.attempt_id)throw new Error("This photo belongs to an earlier attempt. Refresh the challenge before continuing.");
  const {error:uploadError}=await client.storage.from(bucket).upload(pendingUpload.path,pendingUpload.blob,{contentType:"image/jpeg",upsert:false});
  if(uploadError)throw uploadError;
  pendingUpload=null;
  stopCamera();message("Photo submitted. Waiting for your connection's photo…");hideSections();el("poseWaiting").hidden=false;
  await refreshState();
 }catch(error){message((error.message||"Could not submit your photo.")+" You can retry without taking another photo.");}
 finally{button.disabled=false;button.textContent=pendingUpload?"Retry photo upload":"Capture and submit photo";}
});

async function review(approved){
 const button=approved?el("approvePose"):el("rejectPose");
 const otherButton=approved?el("rejectPose"):el("approvePose");
 const id=button.dataset.submissionId;if(!id||reviewing)return;
 reviewing=true;button.disabled=true;otherButton.disabled=true;message("Saving your review…");
 try{
  const {data,error}=await client.rpc("review_realcheck_pose_submission",{p_submission_id:id,p_approve:approved});
  if(error)throw error;
  if(data.status==="passed"){await loadAttempt();return;}
  if(data.status==="next_attempt"){message("That attempt did not pass. A new random pose is ready.");attempt=null;await loadAttempt();return;}
  hideSections();el("poseWaiting").hidden=false;message(data.message||"Your review is saved. Waiting for the other participant.");
 }catch(error){message(error.message||"Could not save your review.");button.disabled=false;otherButton.disabled=false;}
 finally{reviewing=false;}
}
el("approvePose").addEventListener("click",()=>review(true));
el("rejectPose").addEventListener("click",()=>review(false));

async function init(){
 if(!client||!conversationId){message("This challenge link is invalid.");return;}
 const {data,error}=await client.auth.getSession();
 if(error||!data.session){message("Please log in to continue.");return;}
 user=data.session.user;
 el("returnToChat").href="./chat.html?id="+encodeURIComponent(conversationId);
 try{await loadAttempt();pollHandle=setInterval(()=>{if(!reviewing)refreshState().catch(e=>message(e.message));},2500);}
 catch(error){message(error.message||"Could not start the challenge. Check the database setup and try again.");}
}
window.addEventListener("beforeunload",()=>{stopCamera();if(timerHandle)clearInterval(timerHandle);if(pollHandle)clearInterval(pollHandle);});
init();
