"use client";

import { memo, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";

// Hà Nội — chỉ là điểm neo mặc định khi chưa có toạ độ, không có ý nghĩa nghiệp vụ.
const DEFAULT_CENTER: [number, number] = [21.0278, 105.8342];

// CSS teardrop marker thay vì ảnh marker mặc định của Leaflet — tránh vấn đề
// bundler (webpack/turbopack) không resolve đúng đường dẫn ảnh PNG trong node_modules.
const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#2563eb;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function RecenterOnChange({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      map.setView([latitude, longitude], map.getZoom());
    }
  }, [latitude, longitude, map]);
  return null;
}

export interface BranchLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
}

function BranchLocationMap({ latitude, longitude, onChange }: BranchLocationMapProps) {
  const center: [number, number] =
    latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={false}
      style={{ height: "220px", width: "100%", borderRadius: "0.75rem" }}
    >
      <ZoomControl position="topright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {latitude !== null && longitude !== null && <Marker position={[latitude, longitude]} icon={markerIcon} />}
      <ClickHandler onPick={onChange} />
      <RecenterOnChange latitude={latitude} longitude={longitude} />
    </MapContainer>
  );
}

// react-leaflet@5 + React 19: re-rendering MapContainer with a "changed" prop
// (e.g. a fresh inline onChange closure from the parent on every render) makes
// it try to re-initialize Leaflet on the same DOM node, crashing with "Map
// container is being reused by another instance". memo() + a stable onChange
// (useCallback in the parent) skip that re-render unless lat/lng actually change.
export default memo(BranchLocationMap);
