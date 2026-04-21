import { Hono } from "hono";
import { getDb, type Env } from "../lib/db";
import { adminLayout, esc } from "../lib/html";
import { requireAuth, layoutCtx, type Ctx } from "../lib/session";
import { pageUrl } from "../lib/subdomain";

const rep = new Hono<Ctx>();

rep.use("/rep", requireAuth);
rep.use("/rep/*", requireAuth);

// ── GET /rep — Rep Dashboard ──
rep.get("/rep", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const user = c.get("user");

  // All stats scoped to this rep's own pages only
  const [weekStats] = await sql`
    SELECT
      (SELECT COUNT(*) FROM landing_pages
        WHERE organization_id = ${org.id} AND created_by_user_id = ${user.id}
          AND created_at >= date_trunc('week', now())) as pages_this_week,
      (SELECT COALESCE(SUM(scan_count), 0) FROM landing_pages
        WHERE organization_id = ${org.id} AND created_by_user_id = ${user.id}
          AND created_at >= date_trunc('week', now())) as scans_this_week,
      (SELECT COUNT(*) FROM leads
        WHERE page_id IN (
          SELECT id FROM landing_pages
          WHERE organization_id = ${org.id} AND created_by_user_id = ${user.id}
        ) AND created_at >= date_trunc('week', now())) as leads_this_week
  `;

  const [allStats] = await sql`
    SELECT
      (SELECT COUNT(*) FROM landing_pages
        WHERE organization_id = ${org.id} AND created_by_user_id = ${user.id}) as total_pages,
      (SELECT COALESCE(SUM(scan_count), 0) FROM landing_pages
        WHERE organization_id = ${org.id} AND created_by_user_id = ${user.id}) as total_scans,
      (SELECT COUNT(*) FROM leads
        WHERE page_id IN (
          SELECT id FROM landing_pages
          WHERE organization_id = ${org.id} AND created_by_user_id = ${user.id}
        )) as total_leads
  `;

  const newLeads = await sql`
    SELECT l.name, l.phone, l.created_at, lp.street_name
    FROM leads l
    JOIN landing_pages lp ON l.page_id = lp.id
    WHERE lp.organization_id = ${org.id}
      AND lp.created_by_user_id = ${user.id}
      AND l.status = 'new'
    ORDER BY l.created_at DESC LIMIT 5
  `;

  const recentPages = await sql`
    SELECT slug, street_name, scan_count, created_at, expires_at,
      (SELECT COUNT(*) FROM leads l WHERE l.page_id = landing_pages.id) as lead_count
    FROM landing_pages
    WHERE organization_id = ${org.id}
      AND created_by_user_id = ${user.id}
    ORDER BY created_at DESC LIMIT 8
  `;

  function timeAgo(dateStr: string): string {
    const now = new Date();
    const d = new Date(dateStr);
    const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  function daysUntil(dateStr: string | null): string {
    if (!dateStr) return "";
    const ms = new Date(dateStr).getTime() - Date.now();
    const days = Math.ceil(ms / 86400000);
    if (days <= 0) return "expired";
    if (days === 1) return "1 day left";
    return `${days} days left`;
  }

  const leadCards = newLeads.map((l: any) => `
    <div class="rep-lead-card">
      <div class="rep-lead-top"><strong>${esc(l.name)}</strong><span class="text-muted">${timeAgo(l.created_at)}</span></div>
      <a href="tel:${esc(l.phone)}" class="rep-lead-phone">${esc(l.phone)}</a>
      <span class="text-muted">From: ${esc(l.street_name)}</span>
    </div>`).join("");

  const pageRows = recentPages.map((p: any) => {
    const exp = daysUntil(p.expires_at);
    const expired = exp === "expired";
    return `
    <a href="/v/${esc(p.slug)}" target="_blank" class="rep-page-row" style="${expired ? 'opacity:.5' : ''}">
      <div>
        <strong>${esc(p.street_name)}</strong>
        <span class="text-muted">${timeAgo(p.created_at)} &middot; ${exp}</span>
      </div>
      <div class="rep-page-stats">
        <span>${p.scan_count} scan${p.scan_count !== 1 ? 's' : ''}</span>
        <span class="rep-page-leads">${p.lead_count} lead${p.lead_count !== 1 ? 's' : ''}</span>
      </div>
    </a>`;
  }).join("");

  return c.html(adminLayout("My Dashboard", `
    <a href="/rep/new" class="fab">+ New Door Knock</a>
    <div class="rep-greeting">
      <h1>${esc(user.name || "Your Dashboard")}</h1>
      <p class="text-muted">${esc(org.display_name)} &middot; your stats &middot; this week</p>
    </div>
    <div class="rep-stats">
      <div class="rep-stat"><div class="rep-stat-num">${weekStats.pages_this_week}</div><div class="rep-stat-label">Pages</div></div>
      <div class="rep-stat"><div class="rep-stat-num">${weekStats.scans_this_week}</div><div class="rep-stat-label">Scans</div></div>
      <div class="rep-stat"><div class="rep-stat-num">${weekStats.leads_this_week}</div><div class="rep-stat-label">Leads</div></div>
    </div>
    <div class="rep-alltime">All time: ${allStats.total_pages} pages &middot; ${allStats.total_scans} scans &middot; ${allStats.total_leads} leads</div>

    ${newLeads.length ? `
    <div class="rep-section">
      <div class="rep-section-header"><h2>New Leads <span class="rep-badge">${newLeads.length}</span></h2></div>
      <div class="rep-lead-list">${leadCards}</div>
    </div>` : ""}

    <div class="rep-section">
      <div class="rep-section-header"><h2>Recent Pages</h2></div>
      ${recentPages.length ? `<div class="rep-page-list">${pageRows}</div>` : `
        <div class="rep-empty"><p>No pages yet.</p><a href="/rep/new" class="btn" style="margin-top:12px">+ Create Door Knock</a></div>`}
    </div>

    <style>
    .fab{position:fixed;bottom:20px;right:20px;background:#8145FC;color:#fff;padding:14px 24px;border-radius:40px;font-size:16px;font-weight:700;text-decoration:none;box-shadow:0 4px 16px rgba(129,69,252,.35);z-index:100}
    .rep-greeting h1{font-size:22px}
    .rep-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 8px}
    .rep-stat{background:#fff;border-radius:12px;padding:16px 12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}
    .rep-stat-num{font-family:'Montserrat',sans-serif;font-size:32px;font-weight:800;color:#8145FC}
    .rep-stat-label{font-size:12px;color:#888;margin-top:2px}
    .rep-alltime{text-align:center;font-size:13px;color:#aaa;margin-bottom:20px}
    .rep-section{margin-bottom:20px}
    .rep-section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .rep-section-header h2{font-size:17px;margin:0;display:flex;align-items:center;gap:8px}
    .rep-badge{background:#c62828;color:#fff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:10px}
    .rep-lead-list{display:flex;flex-direction:column;gap:8px}
    .rep-lead-card{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:3px solid #c62828}
    .rep-lead-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .rep-lead-phone{color:#8145FC;font-weight:600;font-size:15px;text-decoration:none;display:block}
    .rep-page-list{display:flex;flex-direction:column;gap:6px}
    .rep-page-row{display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:10px;padding:12px 14px;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06)}
    .rep-page-row strong{font-size:14px;color:#1a1a1a;display:block}
    .rep-page-stats{display:flex;gap:12px;font-size:13px;color:#888}
    .rep-page-leads{color:#8145FC;font-weight:600}
    .rep-empty{text-align:center;background:#fff;border-radius:12px;padding:32px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);color:#888}
    .container{padding-bottom:80px}
    </style>
  `, layoutCtx(c)));
});

// ── GET /rep/new ──
rep.get("/rep/new", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const user = c.get("user");

  const [jobs, campaigns] = await Promise.all([
    sql`SELECT id, address, neighborhood FROM active_jobs WHERE organization_id = ${org.id} AND status = 'active' ORDER BY created_at DESC`,
    sql`SELECT id, name, neighborhood FROM campaigns WHERE organization_id = ${org.id} AND is_active = true ORDER BY created_at DESC`,
  ]);

  const jobOptions = jobs.map((j: any) =>
    `<option value="${esc(j.id)}">${esc(j.address)}${j.neighborhood ? ` (${esc(j.neighborhood)})` : ""}</option>`).join("");
  const campaignOptions = campaigns.map((c: any) =>
    `<option value="${esc(c.id)}">${esc(c.name)}${c.neighborhood ? ` — ${esc(c.neighborhood)}` : ""}</option>`).join("");

  return c.html(adminLayout("Create a Door Knock", `
    <h1>Create a Door Knock</h1>
    <p class="text-muted mb-4">Pages and videos expire 14 days after creation.</p>
    <form id="createForm" class="card">
      <div class="form-group">
        <label>Video (15–60 seconds)</label>
        <div class="upload-zone" id="uploadZone">
          <p><strong>Tap to Record or Upload Video</strong></p>
          <p class="text-muted mt-2">MP4, MOV — max 50 MB</p>
          <input type="file" id="videoInput" accept="video/*" capture="environment">
        </div>
        <div class="upload-progress hidden" id="uploadProgress">
          <div class="progress-bar"><div class="progress-bar-fill" id="progressFill" style="width:0%"></div></div>
          <p class="text-muted mt-2" id="progressText">Uploading...</p>
        </div>
        <input type="hidden" id="videoKey" name="video_key">
      </div>
      <div class="form-group"><label>Street or Neighborhood *</label><input type="text" id="streetName" name="street_name" required></div>
      ${campaigns.length ? `<div class="form-group"><label>Campaign</label><select id="campaignId"><option value="">— None —</option>${campaignOptions}</select></div>` : ""}
      ${jobs.length ? `<div class="form-group"><label>Active Job</label><select id="jobId"><option value="">— None —</option>${jobOptions}</select></div>` : ""}
      <div class="form-group"><label>Your First Name</label><input type="text" id="repName" value="${esc(user.name?.split(' ')[0] || '')}"></div>
      <div class="form-group"><label>Personal Note</label><textarea id="repNote" rows="2"></textarea></div>

      <div class="form-group">
        <label>Before / After Photos <span class="text-muted" style="font-weight:400">(optional, up to 6)</span></label>
        <div id="photoPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"></div>
        <div class="upload-zone" id="photoZone" style="padding:20px 16px">
          <p><strong>Tap to Add Photos</strong></p>
          <p class="text-muted" style="font-size:12px;margin-top:4px">JPG / PNG — max 5 MB each</p>
          <input type="file" id="photoInput" accept="image/*" multiple>
        </div>
        <input type="hidden" id="photoKeys" name="photo_keys">
      </div>

      <button type="submit" class="btn" id="createBtn" disabled>Upload Video First</button>
    </form>

    <div id="successSection" class="hidden">
      <div class="card">
        <h2 style="text-align:center;margin-bottom:4px">Page Created!</h2>
        <p class="text-muted" style="text-align:center;margin-bottom:16px" id="pageUrl"></p>
        <div class="qr-wrap">
          <canvas id="qrCanvas"></canvas>
          <div class="qr-actions mt-4">
            <a id="printLink" href="#" class="btn btn-sm">Print Sticker</a>
            <button class="btn btn-sm btn-outline" onclick="downloadQR()">Download QR</button>
            <a id="previewLink" href="#" target="_blank" class="btn btn-sm btn-outline">Preview</a>
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:16px">
        <a href="/rep" class="btn">Back</a>
        <button class="btn btn-outline" onclick="location.reload()" style="margin-left:8px">+ Another</button>
      </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
    <script>
    (function(){
      var uploadZone=document.getElementById('uploadZone'),videoInput=document.getElementById('videoInput'),
          videoKeyInput=document.getElementById('videoKey'),createBtn=document.getElementById('createBtn'),
          progressDiv=document.getElementById('uploadProgress'),progressFill=document.getElementById('progressFill'),progressText=document.getElementById('progressText');
      uploadZone.addEventListener('click',function(){videoInput.click()});
      videoInput.addEventListener('change',function(){if(this.files.length)handleFile(this.files[0])});
      function handleFile(file){
        if(file.size>50*1024*1024){alert('Video must be under 50 MB');return}
        uploadZone.classList.add('hidden');progressDiv.classList.remove('hidden');
        var fd=new FormData();fd.append('video',file);
        var xhr=new XMLHttpRequest();xhr.open('POST','/api/upload');
        xhr.upload.onprogress=function(e){if(e.lengthComputable){var p=Math.round(e.loaded/e.total*100);progressFill.style.width=p+'%';progressText.textContent='Uploading... '+p+'%'}};
        xhr.onload=function(){if(xhr.status===200){var d=JSON.parse(xhr.responseText);videoKeyInput.value=d.key;createBtn.disabled=false;createBtn.textContent='Create Page & Get QR';progressText.textContent='Video uploaded!'}else{progressText.textContent='Upload failed'}};
        xhr.send(fd);
      }
      document.getElementById('createForm').addEventListener('submit',function(e){
        e.preventDefault();createBtn.disabled=true;createBtn.textContent='Creating...';
        var body={video_key:videoKeyInput.value,street_name:document.getElementById('streetName').value.trim(),
          campaign_id:document.getElementById('campaignId')?document.getElementById('campaignId').value||null:null,
          job_id:document.getElementById('jobId')?document.getElementById('jobId').value||null:null,
          rep_name:document.getElementById('repName').value.trim()||null,
          rep_note:document.getElementById('repNote').value.trim()||null,
          photo_keys:uploadedPhotos.length?uploadedPhotos:null};
        fetch('/api/pages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
          .then(function(r){return r.json()}).then(function(d){if(d.slug)showSuccess(d.slug);else alert('Error: '+(d.error||'Unknown'))});
      });
      function showSuccess(slug){
        document.getElementById('createForm').classList.add('hidden');
        document.getElementById('successSection').classList.remove('hidden');
        var url=location.origin+'/v/'+slug;
        document.getElementById('pageUrl').textContent=url;
        document.getElementById('previewLink').href=url;
        document.getElementById('printLink').href='/rep/print/'+slug;
        new QRious({element:document.getElementById('qrCanvas'),value:url,size:280,level:'M',background:'#fff',foreground:'#32373c'});
      }
      window.downloadQR=function(){var c=document.getElementById('qrCanvas');var l=document.createElement('a');l.download='qr.png';l.href=c.toDataURL('image/png');l.click()};

      // ── Photo upload logic ──
      var photoZone=document.getElementById('photoZone'),photoInput=document.getElementById('photoInput'),
          photoKeysInput=document.getElementById('photoKeys'),photoPreview=document.getElementById('photoPreview');
      var uploadedPhotos=[];
      photoZone.addEventListener('click',function(){photoInput.click()});
      photoInput.addEventListener('change',function(){
        var files=Array.from(this.files||[]);
        if(uploadedPhotos.length+files.length>6){alert('Maximum 6 photos');return}
        files.forEach(function(file){
          if(file.size>5*1024*1024){alert(file.name+' exceeds 5 MB');return}
          var fd=new FormData();fd.append('photo',file);
          var thumb=document.createElement('div');
          thumb.style.cssText='width:80px;height:80px;border-radius:8px;background:#e0e0e0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#888;position:relative;overflow:hidden';
          thumb.textContent='...';
          photoPreview.appendChild(thumb);
          var xhr=new XMLHttpRequest();xhr.open('POST','/api/upload-photo');
          xhr.onload=function(){
            if(xhr.status===200){
              var d=JSON.parse(xhr.responseText);
              uploadedPhotos.push(d.key);
              photoKeysInput.value=JSON.stringify(uploadedPhotos);
              var img=document.createElement('img');
              img.src='/api/video/'+d.key;img.style.cssText='width:100%;height:100%;object-fit:cover';
              thumb.textContent='';thumb.appendChild(img);
              var rm=document.createElement('button');rm.type='button';rm.textContent='x';
              rm.style.cssText='position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:20px;padding:0';
              rm.onclick=function(){
                uploadedPhotos=uploadedPhotos.filter(function(k){return k!==d.key});
                photoKeysInput.value=JSON.stringify(uploadedPhotos);
                thumb.remove();
              };
              thumb.appendChild(rm);
            }else{thumb.textContent='fail';thumb.style.borderColor='red'}
          };
          xhr.send(fd);
        });
        photoInput.value='';
      });
    })();
    </script>
  `, layoutCtx(c)));
});

// ── GET /rep/print/:slug ──
rep.get("/rep/print/:slug", async (c) => {
  const sql = getDb(c.env);
  const org = c.get("org");
  const slug = c.req.param("slug");
  const rows = await sql`SELECT street_name FROM landing_pages WHERE slug = ${slug} AND organization_id = ${org.id} LIMIT 1`;
  if (!rows.length) return c.text("Not found", 404);
  const page = rows[0] as { street_name: string };
  const fullUrl = pageUrl(org.slug, slug, c.env.SITE_URL);
  return c.html(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Print QR</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa}
.label{background:#fff;width:4in;height:6in;padding:.4in;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1)}
.lc{font-weight:700;font-size:18px;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px}
.cta{font-size:20px;font-weight:700;margin-top:20px}
.url{font-size:11px;color:#999;margin-top:16px}
.btns{position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
.btns button,.btns a{padding:10px 20px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;border:none}
.bp{background:#8145FC;color:#fff}.bb{background:#fff;color:#32373c;border:1.5px solid #32373c}
@media print{body{background:#fff}.btns{display:none}.label{box-shadow:none}@page{size:4in 6in;margin:0}}</style></head>
<body><div class="btns"><button class="bp" onclick="window.print()">Print</button><a href="/rep" class="bb">Back</a></div>
<div class="label"><div class="lc">${esc(org.display_name)}</div><canvas id="q"></canvas><div class="cta">Scan for a Free Quote</div><div class="url">${esc(fullUrl)}</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>
<script>new QRious({element:document.getElementById('q'),value:'${fullUrl}',size:220,level:'M',background:'#fff',foreground:'#32373c'})</script>
</body></html>`);
});

export default rep;
