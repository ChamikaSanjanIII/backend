# CMovieZ Backend Server Setup & Deployment Guide

CMovieZ වෙබ් අඩවියේ Backend API සේවාදායකය (Express + MongoDB) සඳහා වන සැකසුම් මාර්ගෝපදේශය.

---

## 1. මෙම Backend එක මුලින්ම GitHub වෙත දාන ආකාරය (Push to GitHub)

ඔබ මුලින්ම මෙම කේතය (code) GitHub එකට ඇතුළත් කිරීමට බලාපොරොත්තු වන්නේ නම්, පහත පියවර අනුගමනය කරන්න:

### පියවර 1: Git Initialize කිරීම
පරිගණකයේ Terminal/CMD එක විවෘත කර `backend` ෆෝල්ඩරය තුළදී පහත විධානය ක්‍රියාත්මක කරන්න:
```bash
git init
```

### පියවර 2: අනවශ්‍ය Files මඟ හැරීම (.gitignore)
ඔබගේ රහස්‍ය තොරතුරු (`.env` file එක) සහ ඩවුන්ලෝඩ් කරන ලද dynamic packages (`node_modules`) GitHub එකට යාම වැළැක්වීම සඳහා `backend` ෆෝල්ඩරය තුළ `.gitignore` නමින් ෆයිල් එකක් සාදා එහි පහත සඳහන් දේ ලියන්න:
```text
node_modules/
.env
```

### පියවර 3: Files සියල්ල Commit කිරීම
```bash
git add .
git commit -m "Initial backend commit"
```

### පියවර 4: GitHub Repository එකට සම්බන්ධ කිරීම
GitHub වෙබ් අඩවියෙන් අලුත් Repository එකක් සාදා, එහි ලින්ක් එක කොපි කරගෙන පහත විධානය ක්‍රියාත්මක කරන්න (ඔබගේ repository link එක ආදේශ කරන්න):
```bash
git branch -M main
git remote add origin <ඔබගේ-github-repository-link-එක>
```

### පියවර 5: GitHub වෙත Push කිරීම
```bash
git push -u origin main
```

---

## 2. වෙනත් පරිගණකයකට Git Pull / Clone කළ පසු කළ යුතු දේ (After Git Pull / Clone)

ඔබ වෙනත් පරිගණකයකට මෙම කේතය බාගත (Pull/Clone) කළ පසු, සේවාදායකය ක්‍රියාත්මක කිරීමට පෙර පහත දේවල් සිදු කළ යුතුය:

### පියවර 1: Dependencies Install කිරීම
බාගත කරන ලද කේතයේ packages ස්ථාපනය කර ගැනීම සඳහා `backend` ෆෝල්ඩරය තුළ සිට පහත විධානය ක්‍රියාත්මක කරන්න:
```bash
npm install
```

### පියවර 2: Environment Variables සැකසීම (`.env` file)
`backend` ෆෝල්ඩරය තුළ **`.env`** නමින් අලුත් ෆයිල් එකක් සාදා, එහි පහත ආකාරයට සැකසුම් සකස් කරන්න:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/cmoviez
ADMIN_EMAIL=chamikasanjan03@gmail.com
ADMIN_PASSWORD=Chamika123@
ADMIN_TOKEN=secret-admin-token-123
CORS_ORIGIN=*
```
*(සටහන: Live production සේවාදායකයේදී `MONGO_URI` එකට ඔබගේ සජීවී MongoDB Cloud/Atlas connection string එක සහ `ADMIN_TOKEN` එකට වඩාත් ආරක්ෂිත මුරපදයක් ලබා දෙන්න.)*

### පියවර 3: Server එක ධාවනය කිරීම (Run Server)

**Development (නිතර වෙනස්කම් කරන විට auto-restart වීමට):**
```bash
npm run dev
```

**Production (සාමාන්‍ය පරිදි ධාවනය කිරීමට):**
```bash
npm start
```

Server එක සාර්ථකව ක්‍රියාත්මක වූ පසු `http://localhost:5000` ඔස්සේ API එක ක්‍රියාත්මක වේ.

---

## 3. සේවාදායකය (Server) නොනැවතී දිගටම ධාවනය කර තැබීම (Run Server Forever with PM2)

සජීවී (Production) සේවාදායකයකදී server එක crash වුවහොත් හෝ computer එක restart වුවහොත් සේවාදායකය ඉබේම නැවත පණගැන්වී (auto-restart) නොනැවතී ධාවනය වීමට **PM2 (Process Manager 2)** මෘදුකාංගය භාවිතා කිරීම නිර්දේශ කෙරේ.

### පියවර 1: PM2 පරිගණකයට ස්ථාපනය කිරීම (Globally Install)
පරිගණකයට PM2 package එක ස්ථාපනය කිරීමට පහත විධානය ක්‍රියාත්මක කරන්න:
```bash
npm install -g pm2
```

### පියවර 2: PM2 මඟින් Server එක Start කිරීම
`backend` ෆෝල්ඩරය තුළ සිට පහත විධානය ක්‍රියාත්මක කරන්න:
```bash
pm2 start server.js --name "cmoviez-api"
```
*(මෙමඟින් `cmoviez-api` නමින් background එකේ සේවාදායකය ධාවනය වීමට පටන් ගනී.)*

### පියවර 3: ධාවනය වන සේවාදායකයන් පරීක්ෂා කිරීම (Check Status)
```bash
pm2 list
```
හෝ සවිස්තරාත්මකව බැලීමට:
```bash
pm2 show cmoviez-api
```

### පියවර 4: Server එක Reboot වුවහොත් Auto-Start වීමට සැකසීම
පරිගණකය හෝ VPS එක restart වුවහොත් PM2 එක සමඟ backend එකද ඉබේම start වීමට පහත විධානයන් ක්‍රියාත්මක කරන්න:
```bash
pm2 startup
pm2 save
```

### පියවර 5: අලුතින් Git Pull කළ පසු Server එක යාවත්කාලීන කිරීම (Update & Restart)
ඔබ කේතයේ (code) වෙනස්කම් සිදු කර නැවත `git pull` කළ පසු, නව වෙනස්කම් සක්‍රීය කිරීමට PM2 එක reload කළ යුතුය:
```bash
# වෙනස්කම් සිදුකළ පසු packages install කරගන්න
npm install

# සේවාදායකය නොනවත්වාම (Zero-downtime) reload කරන්න
pm2 reload cmoviez-api
```
*(සේවාදායකය සම්පූර්ණයෙන්ම restart කිරීමට අවශ්‍ය නම්: `pm2 restart cmoviez-api`)*
