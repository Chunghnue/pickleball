"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import Link from "next/link";
import { toast } from "sonner";
import { LocateFixed, Maximize } from "lucide-react";
import { GoogleMutantLayer, type GoogleLayerType } from "./google-mutant-layer";

export interface VenueMapItem {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  courtsCount: number;
  latitude: number | null;
  longitude: number | null;
}

type VenueWithCoords = VenueMapItem & { latitude: number; longitude: number };

function hasCoords(venue: VenueMapItem): venue is VenueWithCoords {
  return venue.latitude !== null && venue.longitude !== null;
}

// Hà Nội — chỉ là điểm neo mặc định khi chưa có kết quả nào có toạ độ,
// không có ý nghĩa nghiệp vụ. Cùng giá trị với branch-location-map.tsx.
const DEFAULT_CENTER: [number, number] = [21.0278, 105.8342];

const HAS_GOOGLE_MAPS_KEY = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

const venueMarkerIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#16a34a;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const userLocationIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function boundsOf(venues: VenueWithCoords[]): [number, number][] {
  return venues.map((v): [number, number] => [v.latitude, v.longitude]);
}

// Tự fit khung nhìn theo kết quả CHỈ 1 lần khi venues load xong lần đầu —
// đổi bộ lọc sau đó không tự động di chuyển bản đồ, người dùng bấm "Về tổng
// quan" (MapControls) nếu muốn fit lại. Xem spec §2.
function FitToVenuesOnce({ venues }: { venues: VenueMapItem[] }) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (didFit.current) return;
    const withCoords = venues.filter(hasCoords);
    if (withCoords.length === 0) return;
    didFit.current = true;
    map.fitBounds(boundsOf(withCoords), { padding: [40, 40] });
  }, [venues, map]);

  return null;
}

function MapControls({ venues }: { venues: VenueMapItem[] }) {
  const map = useMap();
  const locationMarkerRef = useRef<L.Marker | null>(null);

  function handleLocateMe() {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị vị trí");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 15);
        locationMarkerRef.current?.remove();
        locationMarkerRef.current = L.marker([latitude, longitude], {
          icon: userLocationIcon,
        }).addTo(map);
      },
      () => toast.error("Không thể truy cập vị trí của bạn"),
    );
  }

  function handleReset() {
    const withCoords = venues.filter(hasCoords);
    if (withCoords.length === 0) {
      map.setView(DEFAULT_CENTER, 6);
      return;
    }
    map.fitBounds(boundsOf(withCoords), { padding: [40, 40] });
  }

  return (
    <div className="absolute right-3 bottom-6 z-[1000] flex flex-col gap-2">
      <button
        type="button"
        onClick={handleLocateMe}
        title="Vị trí của tôi"
        className="flex size-9 items-center justify-center rounded-full bg-card shadow-md ring-1 ring-foreground/10 hover:bg-accent"
      >
        <LocateFixed className="size-4" />
      </button>
      <button
        type="button"
        onClick={handleReset}
        title="Về tổng quan"
        className="flex size-9 items-center justify-center rounded-full bg-card shadow-md ring-1 ring-foreground/10 hover:bg-accent"
      >
        <Maximize className="size-4" />
      </button>
    </div>
  );
}

type LayerOption = "osm" | GoogleLayerType;

function LayerSwitcher({ layer, onChange }: { layer: LayerOption; onChange: (layer: LayerOption) => void }) {
  if (!HAS_GOOGLE_MAPS_KEY) return null;

  const options: { value: LayerOption; label: string }[] = [
    { value: "roadmap", label: "Google Maps" },
    { value: "satellite", label: "Vệ tinh" },
    { value: "osm", label: "OpenStreetMap" },
  ];

  return (
    <div className="absolute top-3 right-3 z-[1000] flex overflow-hidden rounded-lg bg-card shadow-md ring-1 ring-foreground/10">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-2.5 py-1.5 text-xs font-medium ${
            layer === option.value ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-accent"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface VenueMapProps {
  venues: VenueMapItem[];
}

export default function VenueMap({ venues }: VenueMapProps) {
  const [layer, setLayer] = useState<LayerOption>("osm");
  const venuesWithCoords = useMemo(() => venues.filter(hasCoords), [venues]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={6}
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      <ZoomControl position="topright" />
      {layer === "osm" && (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      )}
      {HAS_GOOGLE_MAPS_KEY && (
        <GoogleMutantLayer type={layer === "satellite" ? "satellite" : "roadmap"} active={layer !== "osm"} />
      )}
      <MarkerClusterGroup chunkedLoading>
        {venuesWithCoords.map((venue) => (
          <Marker key={venue.id} position={[venue.latitude, venue.longitude]} icon={venueMarkerIcon}>
            <Popup>
              <div className="flex flex-col gap-1">
                <strong>{venue.name}</strong>
                <span>
                  {venue.district ? `${venue.district}, ` : ""}
                  {venue.city}
                </span>
                <span>{venue.courtsCount} sân</span>
                <Link href={`/venues/${venue.id}`} className="font-medium text-green-600 hover:underline">
                  Chi tiết
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <FitToVenuesOnce venues={venues} />
      <MapControls venues={venues} />
      <LayerSwitcher layer={layer} onChange={setLayer} />
    </MapContainer>
  );
}
