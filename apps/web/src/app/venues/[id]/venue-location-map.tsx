"use client";

import { memo, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl } from "react-leaflet";

const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#16a34a;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

export interface VenueLocationMapProps {
  latitude: number;
  longitude: number;
  name: string;
}

function VenueLocationMap({ latitude, longitude, name }: VenueLocationMapProps) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    markerRef.current?.openPopup();
  }, []);

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      zoomControl={false}
      closePopupOnClick={false}
      style={{ height: "220px", width: "100%", borderRadius: "0.75rem" }}
    >
      <ZoomControl position="topleft" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={markerIcon} ref={markerRef}>
        <Popup autoClose={false}>{name}</Popup>
      </Marker>
    </MapContainer>
  );
}

export default memo(VenueLocationMap);
