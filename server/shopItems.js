const SHOP_ITEMS = [
  // ── SKINS ─────────────────────────────────────────────
  { id: 'skin_default',   name: 'Default',          category: 'skin',   price: 0,    color: 0x1a88ff, preview: '#1a88ff', description: 'Your starter look.' },
  { id: 'skin_crimson',   name: 'Red Squad',         category: 'skin',   price: 150,  color: 0xcc1122, preview: '#cc1122', description: 'Stand out in red!' },
  { id: 'skin_ocean',     name: 'Ocean Blue',        category: 'skin',   price: 150,  color: 0x0066cc, preview: '#0066cc', description: 'Cool ocean blue.' },
  { id: 'skin_forest',    name: 'Camo',              category: 'skin',   price: 150,  color: 0x2a6e1a, preview: '#2a6e1a', description: 'Blend into the action.' },
  { id: 'skin_gold',      name: 'Gold',              category: 'skin',   price: 300,  color: 0xd4a017, preview: '#d4a017', description: 'For champions only.' },
  { id: 'skin_shadow',    name: 'Stealth',           category: 'skin',   price: 300,  color: 0x1a1a2e, preview: '#1a1a2e', description: 'Dark and sneaky.' },
  { id: 'skin_rainbow',   name: 'Rainbow',           category: 'skin',   price: 500,  color: 0xff44aa, preview: '#ff44aa', description: 'All the colors!' },

  // ── WEAPON SKINS ──────────────────────────────────────
  { id: 'weapon_default', name: 'Default Weapons',   category: 'weapon', price: 0,    color: 0x9b30e8, preview: '🔫',  description: 'Standard weapon FX.' },
  { id: 'weapon_laser',   name: 'Laser',             category: 'weapon', price: 200,  color: 0xff0088, preview: '🔴',  description: 'Hot pink laser shots.' },
  { id: 'weapon_freeze',  name: 'Freeze',            category: 'weapon', price: 200,  color: 0x88eeff, preview: '❄️',  description: 'Icy freeze beams.' },
  { id: 'weapon_plasma',  name: 'Plasma',            category: 'weapon', price: 200,  color: 0x44ff44, preview: '💚',  description: 'Neon green plasma.' },
  { id: 'weapon_rocket',  name: 'Rocket',            category: 'weapon', price: 350,  color: 0xff6600, preview: '🚀',  description: 'Big orange rockets.' },
  { id: 'weapon_thunder', name: 'Lightning',         category: 'weapon', price: 350,  color: 0xffee00, preview: '⚡',  description: 'Electric yellow bolts.' },

  // ── TITLES ────────────────────────────────────────────
  { id: 'title_player',   name: 'Player',            category: 'title',  price: 0,    preview: '#aaaaaa', description: 'Just a regular player.' },
  { id: 'title_rookie',   name: 'Rookie',            category: 'title',  price: 0,    preview: '#88bbff', description: 'New to the arena.' },
  { id: 'title_champion', name: 'Champion',          category: 'title',  price: 400,  preview: '#f0c040', description: 'Proven in battle.' },
  { id: 'title_pro',      name: 'Pro',               category: 'title',  price: 600,  preview: '#9b30e8', description: 'A true pro player.' },
  { id: 'title_ghost',    name: 'Ghost',             category: 'title',  price: 600,  preview: '#aaddff', description: 'Spooky and fast!' },
  { id: 'title_thunder',  name: 'Thunderbolt',       category: 'title',  price: 800,  preview: '#ffee00', description: 'Fast as lightning.' },
  { id: 'title_legend',   name: 'Legend',            category: 'title',  price: 1000, preview: '#ff8800', description: 'Songs are sung of you.' },

  // ── EMOTES ────────────────────────────────────────────
  { id: 'emote_wave',  name: 'Wave',   category: 'emote', price: 0,   preview: '👋', description: 'A friendly greeting.' },
  { id: 'emote_gg',    name: 'GG',     category: 'emote', price: 0,   preview: '🤝', description: 'Good game, respect.' },
  { id: 'emote_laugh', name: 'Laugh',  category: 'emote', price: 100, preview: '😂', description: 'Too funny!' },
  { id: 'emote_flex',  name: 'Flex',   category: 'emote', price: 150, preview: '💪', description: 'Show off your power.' },
  { id: 'emote_angry', name: 'Angry',  category: 'emote', price: 100, preview: '😤', description: 'So frustrated!' },
  { id: 'emote_dance', name: 'Dance',  category: 'emote', price: 200, preview: '🕺', description: 'Victory dance!' },
  { id: 'emote_think', name: 'Think',  category: 'emote', price: 100, preview: '🤔', description: 'Hmm...' },
  { id: 'emote_fire',  name: 'Hype',   category: 'emote', price: 200, preview: '🔥', description: 'Pure hype energy.' },
];

module.exports = SHOP_ITEMS;
