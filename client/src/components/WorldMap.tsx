import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { apiUrl } from '../api';

interface SiteLocation {
  id: number;
  name: string;
  url: string;
  server_ip: string;
  hosting_provider: string;
  status: string;
  latitude: number;
  longitude: number;
  country: string;
  city: string;
}

export default function WorldMap() {
  const [locations, setLocations] = useState<SiteLocation[]>([]);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchLocations = async () => {
    try {
      const res = await fetch(apiUrl('/api/sites/locations'));
      const data = await res.json();
      setLocations(data);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    }
  };

  // Calculate map center based on locations (default: world view)
  const center: [number, number] =
    locations.length > 0
      ? [
          locations.reduce((sum, l) => sum + l.latitude, 0) / locations.length,
          locations.reduce((sum, l) => sum + l.longitude, 0) / locations.length,
        ]
      : [20, 0];

  return (
    <div className="bg-navy-surface border border-border rounded-2xl p-6">
      <h3 className="text-white font-heading font-bold text-lg mb-4">Server Yerləşməsi</h3>

      {locations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">Hələ yerləşmə məlumatı yoxdur</p>
          <p className="text-text-muted text-xs mt-1">Saytlar yoxlanılandan sonra xəritədə görünəcək</p>
        </div>
      ) : (
        <div className="relative">
          <div className="rounded-lg overflow-hidden border border-border" style={{ height: '420px' }}>
            <MapContainer
              center={center}
              zoom={locations.length > 0 ? 3 : 2}
              minZoom={2}
              maxZoom={18}
              scrollWheelZoom={true}
              worldCopyJump={true}
              style={{ height: '100%', width: '100%', background: '#14213d' }}
            >
              {/* Dark themed tiles (CartoDB dark_matter, free, no API key) */}
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />

              {locations.map(location => {
                const isOnline = location.status === 'online';
                const color = isOnline ? '#34d399' : '#ef4444';
                return (
                  <CircleMarker
                    key={location.id}
                    center={[location.latitude, location.longitude]}
                    radius={9}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 2,
                      fillColor: color,
                      fillOpacity: 0.9,
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -8]}>
                      <span style={{ fontWeight: 600 }}>{location.name}</span>
                    </Tooltip>
                    <Popup>
                      <div style={{ minWidth: '160px' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{location.name}</div>
                        <div style={{ fontSize: 12, color: '#555' }}>
                          <div>
                            <b>Status:</b>{' '}
                            <span style={{ color: isOnline ? '#16a34a' : '#dc2626' }}>
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <div><b>Şəhər:</b> {location.city || 'N/A'}, {location.country || 'N/A'}</div>
                          <div><b>IP:</b> {location.server_ip || 'N/A'}</div>
                          <div><b>Hosting:</b> {location.hosting_provider || 'N/A'}</div>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
              <span className="text-text-muted">Online</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <span className="text-text-muted">Offline</span>
            </div>
            <div className="ml-auto text-text-muted">{locations.length} server</div>
          </div>

          {/* Location list */}
          <div className="mt-4 space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
            {locations.map(location => (
              <div
                key={location.id}
                className="flex items-center justify-between p-2 bg-navy-light rounded-lg hover:border hover:border-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${location.status === 'online' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{location.name}</p>
                    <p className="text-text-muted text-xs">
                      {location.city}, {location.country}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-accent text-xs">{location.hosting_provider}</p>
                  <p className="text-text-muted text-xs font-mono">{location.server_ip}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
