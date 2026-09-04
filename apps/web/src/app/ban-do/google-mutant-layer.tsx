"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import L from "leaflet";
import "leaflet.gridlayer.googlemutant";
import { useMap } from "react-leaflet";

export type GoogleLayerType = "roadmap" | "satellite";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function isGoogleMapsLoaded(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { google?: { maps?: unknown } }).google?.maps);
}

type GoogleMutantFactory = (options: { type: GoogleLayerType }) => L.Layer;

function createGoogleMutantLayer(type: GoogleLayerType): L.Layer {
  const factory = (L.gridLayer as unknown as { googleMutant: GoogleMutantFactory }).googleMutant;
  return factory({ type });
}

export interface GoogleMutantLayerProps {
  type: GoogleLayerType;
  active: boolean;
}

export function GoogleMutantLayer({ type, active }: GoogleMutantLayerProps) {
  const map = useMap();
  const [scriptLoaded, setScriptLoaded] = useState(isGoogleMapsLoaded());
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!active || !scriptLoaded) {
      layerRef.current?.remove();
      layerRef.current = null;
      return;
    }
    const layer = createGoogleMutantLayer(type);
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [active, scriptLoaded, type, map]);

  if (!GOOGLE_MAPS_API_KEY) return null;

  return (
    <Script
      src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`}
      strategy="afterInteractive"
      onLoad={() => setScriptLoaded(true)}
    />
  );
}
