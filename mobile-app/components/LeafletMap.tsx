import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

interface LeafletMapProps {
  center: { latitude: number; longitude: number };
  zoom?: number;
  markers?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title?: string;
    color?: string;
    icon?: 'tractor' | 'stop';
  }>;
  route?: Array<{ latitude: number; longitude: number }>;
  mapType?: 'standard' | 'satellite' | 'hybrid';
}

export default function LeafletMap({ center, zoom = 15, markers = [], route = [], mapType = 'standard' }: LeafletMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Generate HTML for Leaflet
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { width: 100%; height: 100vh; }
        .custom-icon {
            display: flex;
            justify-content: center;
            align-items: center;
            background: none;
            border: none;
        }
        .tractor-marker {
            font-size: 24px;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${center.latitude}, ${center.longitude}], ${zoom});
        
        // Tile Layer
        var tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        if ('${mapType}' === 'satellite' || '${mapType}' === 'hybrid') {
            tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        }
        
        L.tileLayer(tileUrl, {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Icons
        var tractorIcon = L.divIcon({
            className: 'custom-icon',
            html: '<div style="background-color: #FF5500; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        var stopIcon = L.divIcon({
            className: 'custom-icon',
            html: '<div style="background-color: #EF4444; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        // Markers
        var markersLayer = L.layerGroup().addTo(map);
        var routeLayer = L.layerGroup().addTo(map);

        function updateMap(data) {
            // Update Markers
            markersLayer.clearLayers();
            data.markers.forEach(m => {
                var icon = m.icon === 'tractor' ? tractorIcon : stopIcon;
                L.marker([m.latitude, m.longitude], { icon: icon })
                 .bindPopup(m.title || '')
                 .addTo(markersLayer);
            });

            // Update Route
            routeLayer.clearLayers();
            if (data.route && data.route.length > 0) {
                var latlngs = data.route.map(p => [p.latitude, p.longitude]);
                L.polyline(latlngs, { color: '#FF5500', weight: 4 }).addTo(routeLayer);
            }

            // Pan to Center
            map.setView([data.center.latitude, data.center.longitude], map.getZoom());
        }

        // Initial Data
        updateMap(${JSON.stringify({ center, markers, route })});

        // Listen for updates from React Native
        document.addEventListener("message", function(event) {
            updateMap(JSON.parse(event.data));
        });
        window.addEventListener("message", function(event) {
            updateMap(JSON.parse(event.data));
        });

      </script>
    </body>
    </html>
  `;

  // Update map when props change
  useEffect(() => {
    if (webViewRef.current) {
      const data = JSON.stringify({ center, markers, route });
      webViewRef.current.postMessage(data);
      // Also inject JS directly to be sure
      webViewRef.current.injectJavaScript(`updateMap(${data}); true;`);
    }
  }, [center, markers, route]);

  return (
    <View style={{ flex: 1, backgroundColor: '#e5e7eb' }}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={{ flex: 1 }}
        scrollEnabled={false}
      />
    </View>
  );
}
