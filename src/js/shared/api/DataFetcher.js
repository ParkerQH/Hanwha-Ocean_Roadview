// 외부 데이터 접근(WFS/REST) 전용 레이어
import { GEOSERVER_WFS } from "../../config/constants";

export class DataFetcher {
  constructor({ 
    wfsBase=GEOSERVER_WFS.BASE, 
    typeName=GEOSERVER_WFS.ROAD_VIEW, 
    srs=GEOSERVER_WFS.SRS 
  } = {}) {
    this.wfsBase = wfsBase;
    this.typeName = typeName;
    this.srs = srs;
    this._cache = new Map(); // URL -> JSON
  }

  // 공통 JSON fetch(+메모리 캐시)
  async _fetchJson(url) {
    try {
      if (this._cache.has(url)) 
        return this._cache.get(url);
    
      const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) 
          throw new Error(`Fetch failed: ${res.status}`);
    
        const json = await res.json();
        this._cache.set(url, json);
        return json;
    } catch (err) {
      console.error("[DataFetcher._fetchJson]", err);
      throw err;
    }
  }

  // WFS GetFeature
  async wfsGet({ cql="" } = {}) {
    const url =
    `${this.wfsBase}?service=WFS&version=1.0.0&request=GetFeature` +
    `&typeName=${encodeURIComponent(this.typeName)}` +
    `&outputFormat=application/json&srsName=${encodeURIComponent(this.srs)}` +
    (cql ? `&CQL_FILTER=${encodeURIComponent(cql)}` : "");
      
    return this._fetchJson(url);
  }
}
