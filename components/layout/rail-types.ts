/** Sağ kolon / mobil özet şeridi öğesi. */
export type RailItem = {
  key: string;
  title: string;
  subtitle?: string | null;
  href: string;
  badge: string;
  when?: string | null;
};
