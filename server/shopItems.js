const SHOP_ITEMS = [
  // ── ROBES ────────────────────────────────────────────
  { id: 'robe_default',    name: 'Default Outfit',  category: 'robe',  price: 0,    color: 0x6a0dad, preview: '#6a0dad', description: 'Your starter outfit.' },
  { id: 'robe_crimson',    name: 'Red Jacket',     category: 'robe',  price: 150,  color: 0xcc1122, preview: '#cc1122', description: 'Stand out in red!' },
  { id: 'robe_ocean',      name: 'Blue Jacket',       category: 'robe',  price: 150,  color: 0x0066cc, preview: '#0066cc', description: 'Cool in blue!' },
  { id: 'robe_forest',     name: 'Camo Outfit',      category: 'robe',  price: 150,  color: 0x1a7a2a, preview: '#1a7a2a', description: 'Blend into the action!' },
  { id: 'robe_gold',       name: 'Gold Suit',      category: 'robe',  price: 300,  color: 0xd4a017, preview: '#d4a017', description: 'Shine like a champion!' },
  { id: 'robe_shadow',     name: 'Stealth Suit',      category: 'robe',  price: 300,  color: 0x1a1a2e, preview: '#1a1a2e', description: 'Be the shadow!' },
  { id: 'robe_rainbow',    name: 'Rainbow Suit',       category: 'robe',  price: 500,  color: 0xff44aa, preview: '#ff44aa', description: 'All the colors!' },

  // ── SPELL EFFECTS ─────────────────────────────────────
  { id: 'spell_default',   name: 'Default FX',    category: 'spell', price: 0,    color: null,     preview: '#9b30e8', description: 'Default shot effects.' },
  { id: 'spell_lava',      name: 'Fire FX',       category: 'spell', price: 200,  color: 0xff6600, preview: '#ff6600', description: 'Fiery shot effects!' },
  { id: 'spell_frost',     name: 'Ice FX',      category: 'spell', price: 200,  color: 0x88eeff, preview: '#88eeff', description: 'Icy cool effects!' },
  { id: 'spell_venom',     name: 'Slime FX',      category: 'spell', price: 200,  color: 0x44ff44, preview: '#44ff44', description: 'Slime green effects!' },
  { id: 'spell_dark',      name: 'Shadow FX',       category: 'spell', price: 350,  color: 0x220033, preview: '#8800cc', description: 'Dark shadow effects!' },
  { id: 'spell_solar',     name: 'Lightning FX',      category: 'spell', price: 350,  color: 0xffdd00, preview: '#ffdd00', description: 'Electric yellow effects!' },

  // ── TITLES ────────────────────────────────────────────
  { id: 'title_wizard',      name: 'Player',         category: 'title', price: 0,    preview: '#f0c040', description: 'A regular player.' },
  { id: 'title_apprentice',  name: 'Rookie',     category: 'title', price: 0,    preview: '#aaaaaa', description: 'Just starting out!' },
  { id: 'title_champion',    name: 'Champion',       category: 'title', price: 400,  preview: '#f0c040', description: 'Proven in battle.' },
  { id: 'title_archmage',    name: 'Pro',       category: 'title', price: 600,  preview: '#9b30e8', description: 'A true pro!' },
  { id: 'title_phantom',     name: 'Ghost',        category: 'title', price: 600,  preview: '#aaddff', description: 'Spooky and fast!' },
  { id: 'title_stormcaller', name: 'Thunderbolt',    category: 'title', price: 800,  preview: '#ffee00', description: 'Fast as lightning!' },
  { id: 'title_legend',      name: 'Legend',         category: 'title', price: 1000, preview: '#ff8800', description: 'Songs are sung of you.' },

  // ── EMOTES ────────────────────────────────────────────
  { id: 'emote_wave',  name: 'Wave',   category: 'emote', price: 0,   preview: '👋', description: 'A friendly greeting.' },
  { id: 'emote_gg',    name: 'GG',     category: 'emote', price: 0,   preview: '🤝', description: 'Good game, respect.' },
  { id: 'emote_laugh', name: 'Laugh',  category: 'emote', price: 100, preview: '😂', description: 'Too funny!' },
  { id: 'emote_flex',  name: 'Flex',   category: 'emote', price: 150, preview: '💪', description: 'Show off your power.' },
  { id: 'emote_angry', name: 'Angry',  category: 'emote', price: 100, preview: '😤', description: 'So frustrated!' },
  { id: 'emote_dance', name: 'Dance',  category: 'emote', price: 200, preview: '🕺', description: 'Victory dance!' },
  { id: 'emote_think', name: 'Think',  category: 'emote', price: 100, preview: '🤔', description: 'Hmm, interesting...' },
  { id: 'emote_fire',  name: 'Hype',   category: 'emote', price: 200, preview: '🔥', description: 'Pure hype energy.' },
];

module.exports = SHOP_ITEMS;
