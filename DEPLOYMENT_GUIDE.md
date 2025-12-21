# 🚀 How to Deploy Papaji GPS Backend to Render

Your project is now configured for easy deployment on **Render.com** (a free cloud hosting provider).

## Step 1: Push Code to GitHub
1. Create a new repository on GitHub (e.g., `papaji-gps`).
2. Push your code:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

## Step 2: Create Service on Render
1. Go to [dashboard.render.com](https://dashboard.render.com/).
2. Click **New +** -> **Blueprints**.
3. Connect your GitHub account and select the `papaji-gps` repository.
4. Render will automatically detect the `render.yaml` file.
5. Click **Apply**.

## Step 3: Configure Environment Variables
Render will ask for the following variables (because we set `sync: false` in the yaml):

*   **SUPABASE_URL**: (Copy from your `.env` file)
*   **SUPABASE_KEY**: (Copy from your `.env` file)

## Step 4: Get Your URL
Once deployed, Render will give you a URL like:
`https://papaji-gps-backend.onrender.com`

## Step 5: Update Firmware
1. Copy your new Render URL.
2. Open `hardware/src/main.cpp`.
3. Update the `server` variable:
   ```cpp
   const char server[] = "papaji-gps-backend.onrender.com";
   const int port = 443; // Render uses HTTPS
   ```
   *(Note: Since we are using HTTPS now, we might need to enable SSL on the SIM800L or use a non-SSL proxy if the module fails to connect via HTTPS directly. If HTTPS fails, you can use `http://papaji-gps-backend.onrender.com` on port 80, but Render usually redirects to HTTPS).*

   **Recommendation:** If the SIM800L fails with HTTPS (Port 443), you might need to keep using **Serveo** or **Ngrok** for the hardware, OR use a "Cloudflare Worker" or "HTTP Proxy" to bridge the connection.
