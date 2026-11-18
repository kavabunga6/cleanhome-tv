package com.gathin.tvhome;

import android.content.Context;

import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

/** Serves the packaged TV interface and its device operations from one local origin. */
final class SharedTvScene extends WebView {
    private static final String HOST = "scene.cleanhome.invalid";
    private final MainActivity owner;
    private final Config config;
    private volatile Map<String, ResolveInfo> entries = Collections.emptyMap();
    private volatile Set<String> inputs = Collections.emptySet();
    private boolean ready;
    private String pending;

    @SuppressLint("SetJavaScriptEnabled")
    SharedTvScene(MainActivity owner, Config config) {
        super(owner);
        this.owner = owner;
        this.config = config;
        setBackgroundColor(0xff070a14);
        getSettings().setJavaScriptEnabled(true);
        getSettings().setDomStorageEnabled(true);
        getSettings().setAllowFileAccess(false);
        getSettings().setAllowContentAccess(false);
        getSettings().setUseWideViewPort(true);
        getSettings().setLoadWithOverviewMode(true);
        setFocusableInTouchMode(true);
        setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try { return serve(request); }
                catch (Exception e) { return error(); }
            }
            @Override public void onPageFinished(WebView view, String url) {
                ready = true;
                if (pending != null) { command(pending); pending = null; }
            }
        });
        loadUrl("https://" + HOST + "/scene/index.html");
    }

    void command(String name) {
        if (!ready) {
            if (!"refresh".equals(name)) pending = name;
            return;
        }
        evaluateJavascript("window.cleanHomeCommand && window.cleanHomeCommand("+JSONObject.quote(name)+")", null);
    }

    void release() {
        if (getParent() instanceof ViewGroup) ((ViewGroup)getParent()).removeView(this);
        destroy();
    }

    private WebResourceResponse serve(WebResourceRequest request) throws Exception {
        Uri uri = request.getUrl();
        if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getAuthority())) return error();
        List<String> path = uri.getPathSegments();
        for (String part : path) {
            if (part.equals("..") || (part.contains("/") && !"device".equals(path.get(0)))) return error();
        }
        if (path.size() >= 2 && "device".equals(path.get(0))) {
            String action = path.get(1);
            if ("GET".equals(request.getMethod())) {
                if ("catalog".equals(action)) return json(catalog());
                if ("clock".equals(action)) {
                    String mode = owner.getSharedPreferences(Config.SETTINGS_NAME, Context.MODE_PRIVATE)
                            .getString(Config.CLOCK_FORMAT_KEY, config.clockFormat);
                    return json(new JSONObject().put("mode", mode)
                            .put("system", ClockFormat.is24(owner, "system") ? "24" : "12"));
                }
                if ("network".equals(action)) return json(network());
                if ("icon".equals(action) && path.size()==3) return icon(path.get(2));
            } else if ("POST".equals(request.getMethod())) {
                String id = path.size()==3 ? path.get(2) : "";
                FutureTask<Boolean> task = new FutureTask<>(() -> {
                    if (owner.isFinishing() || owner.isDestroyed()) return false;
                    switch (action) {
                        case "clock":
                            if (!"system".equals(id) && !"12".equals(id) && !"24".equals(id)) return false;
                            owner.getSharedPreferences(Config.SETTINGS_NAME, Context.MODE_PRIVATE)
                                    .edit().putString(Config.CLOCK_FORMAT_KEY, id).apply();
                            return true;
                        case "launch": return launch(id);
                        case "settings": owner.startActivity(SystemSettings.intent(owner,android.provider.Settings.ACTION_SETTINGS)); return true;
                        case "home-settings": owner.startActivity(new Intent(owner,HomeSettingsActivity.class)); return true;
                        case "startup":
                            if (!config.openOnStartChoice) return false;
                            owner.startActivity(new Intent(owner,LauncherSettingsActivity.class).putExtra(LauncherSettingsActivity.STARTUP_ONLY,true));
                            return true;
                        case "back": owner.sceneHomeBack(); return true;
                        default: return false;
                    }
                });
                owner.runOnUiThread(task);
                if (task.get(4, TimeUnit.SECONDS)) return json(new JSONObject());
            }
            return error();
        }
        if (!"GET".equals(request.getMethod()) || path.size()<2 || !"scene".equals(path.get(0))) return error();
        String file = String.join("/", path);
        String asset = file.endsWith(".jpg") ? "theme/wallpapers/"+path.get(path.size()-1) : file;
        String mime = file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css"
                : file.endsWith(".ttf") ? "font/ttf" : file.endsWith(".jpg") ? "image/jpeg" : "text/html";
        InputStream content = owner.getAssets().open(asset);
        return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") ? "UTF-8" : null, content);
    }

    private JSONObject catalog() throws Exception {
        PackageManager pm = owner.getPackageManager();
        Map<String, ResolveInfo> found = new LinkedHashMap<>();
        for (String category : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
            for (ResolveInfo info : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(category), 0)) {
                if (info.activityInfo == null || !info.activityInfo.exported) continue;
                String id = info.activityInfo.packageName;
                if (!id.equals(owner.getPackageName()) && !config.libraryExcludedApps.contains(id)) found.putIfAbsent(id, info);
            }
        }
        JSONArray rows = new JSONArray();
        for (Map.Entry<String, ResolveInfo> entry : found.entrySet()) {
            String id = entry.getKey();
            String name = config.appLabels.get(id);
            if (name == null) name = entry.getValue().loadLabel(pm).toString();
            long version;
            try { version = pm.getPackageInfo(id, 0).lastUpdateTime; }
            catch (PackageManager.NameNotFoundException removedDuringScan) { continue; }
            rows.put(new JSONObject().put("id",id).put("name",name).put("recent",LastOpened.get(owner,id))
                    .put("icon","/device/icon/"+Uri.encode(id)+"?v="+version));
        }
        JSONArray ports = new JSONArray();
        Set<String> portIds = new HashSet<>();
        TvInputManager manager = owner.getSystemService(TvInputManager.class);
        if (manager != null) for (TvInputInfo input : manager.getTvInputList()) {
            if (!input.isPassthroughInput() || input.isHidden(owner)) continue;
            String id = input.getId();
            portIds.add(id);
            CharSequence label = input.loadCustomLabel(owner);
            ports.put(new JSONObject().put("id",id).put("name",label == null ? input.loadLabel(owner) : label));
        }
        JSONArray order = new JSONArray();
        Order saved = Order.load(Order.file(owner));
        if (saved != null) for (String key : saved.keys) {
            ComponentName component = ComponentName.unflattenFromString(key);
            if (component != null) order.put(component.getPackageName());
        }
        Set<String> hidden = new HashSet<>(config.hiddenApps);
        hidden.removeAll(LibraryApps.load(owner));
        hidden.addAll(LibraryApps.loadRemoved(owner));
        entries = found;
        inputs = portIds;
        return new JSONObject().put("apps",rows).put("inputs",ports).put("order",order).put("hidden",new JSONArray(hidden)).put("startupAvailable",config.openOnStartChoice);
    }

    private boolean launch(String id) {
        if (inputs.contains(id)) { owner.onOpenInput(id); return true; }
        ResolveInfo info = entries.get(id);
        if (info == null) return false;
        PackageManager pm = owner.getPackageManager();
        Intent intent = pm.getLeanbackLaunchIntentForPackage(id);
        if (intent == null) intent = pm.getLaunchIntentForPackage(id);
        String custom = config.launchActions.get(id);
        if (custom != null) {
            String input = LaunchActions.inputId(custom);
            if (input != null) { owner.onOpenInput(input); return true; }
            Intent configured = LaunchActions.intent(id, custom);
            if (configured.resolveActivity(pm) != null) intent = configured;
        }
        if (intent == null) return false;
        owner.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        LastOpened.record(owner,id);
        return true;
    }

    private WebResourceResponse icon(String id) throws Exception {
        ResolveInfo info = entries.get(id);
        if (info == null) return error();
        PackageManager pm = owner.getPackageManager();
        Drawable image = AppAdapter.loadBanner(owner,pm,info);
        if (image == null) image = info.loadIcon(pm);
        if (image == null) return error();
        int w = Math.max(1,image.getIntrinsicWidth()), h = Math.max(1,image.getIntrinsicHeight());
        float scale = Math.min(320f/w,180f/h);
        Bitmap bitmap = Bitmap.createBitmap(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)),Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        image.setBounds(0,0,canvas.getWidth(),canvas.getHeight());
        image.draw(canvas);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG,100,buffer);
        bitmap.recycle();
        return new WebResourceResponse("image/png",null,200,"OK",Collections.singletonMap("Cache-Control","private, max-age=86400"),new ByteArrayInputStream(buffer.toByteArray()));
    }

    private JSONObject network() throws Exception {
        ConnectivityManager cm = owner.getSystemService(ConnectivityManager.class);
        NetworkCapabilities caps = cm == null ? null : cm.getNetworkCapabilities(cm.getActiveNetwork());
        JSONObject result = new JSONObject();
        if (caps != null) {
            String type = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi" : caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "wired" : null;
            if (type != null) result.put(type,new JSONObject().put("state","connected"));
        }
        return result;
    }
    private static WebResourceResponse json(JSONObject value) {
        return new WebResourceResponse("application/json","UTF-8",new ByteArrayInputStream(value.toString().getBytes(StandardCharsets.UTF_8)));
    }
    private static WebResourceResponse error() {
        return new WebResourceResponse("text/plain","UTF-8",404,"Not available",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
}
