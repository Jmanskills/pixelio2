// All purchasable items in Pixelio
// category: 'robe' | 'spell' | 'title'
// color: hex number used by Three.js for robes/spell effects

const SHOP_ITEMS = [
  // ── ROBES ──────────────────────────────────────────────
  { id: 'robe_default',   name: 'Apprentice Robe',  category: 'robe',  price: 0,    color: 0x6a0dad, preview: '#6a0dad', description: 'The classic purple robe.' },
  { id: 'robe_crimson',   name: 'Crimson Robe',     category: 'robe',  price: 150,  color: 0xcc1122, preview: '#cc1122', description: 'Burn bright in battle.' },
  { id: 'robe_ocean',     name: 'Ocean Robe',       category: 'robe',  price: 150,  color: 0x0066cc, preview: '#0066cc', description: 'Cool as the deep sea.' },
  { id: 'robe_forest',    name: 'Forest Robe',      category: 'robe',  price: 150,  color: 0x1a7a2a, preview: '#1a7a2a', description: 'One with the wild.' },
  { id: 'robe_gold',      name: 'Golden Robe',      category: 'robe',  price: 300,  color: 0xd4a017, preview: '#d4a017', description: 'For champions only.' },
  { id: 'robe_shadow',    name: 'Shadow Robe',      category: 'robe',  price: 300,  color: 0x1a1a2e, preview: '#1a1a2e', description: 'Darkness made cloth.' },
  { id: 'robe_rainbow',   name: 'Prism Robe',       category: 'robe',  price: 500,  color: 0xff44aa, preview: 'linear-gradient(135deg,#ff4466,#44aaff,#44ff88)', description: 'All the colors at once.' },

  // ── SPELL EFFECTS ───────────────────────────────────────
  { id: 'spell_default',  name: 'Classic Magic',    category: 'spell', price: 0,    color: null, preview: '#9b30e8', description: 'Standard spell visuals.' },
  { id: 'spell_lava',     name: 'Lava Magic',       category: 'spell', price: 200,  color: 0xff6600, preview: '#ff6600', description: 'Spells erupt like magma.' },
  { id: 'spell_frost',    name: 'Frost Magic',      category: 'spell', price: 200,  color: 0x88eeff, preview: '#88eeff', description: 'Icy blue spell trails.' },
  { id: 'spell_venom',    name: 'Venom Magic',      category: 'spell', price: 200,  color: 0x44ff44, preview: '#44ff44', description: 'Toxic green spells.' },
  { id: 'spell_dark',     name: 'Dark Magic',       category: 'spell', price: 350,  color: 0x220033, preview: '#8800cc', description: 'Void-infused spells.' },
  { id: 'spell_solar',    name: 'Solar Magic',      category: 'spell', price: 350,  color: 0xffdd00, preview: '#ffdd00', description: 'Pure sunlight energy.' },

  // ── TITLES ──────────────────────────────────────────────
  { id: 'title_wizard',     name: 'Wizard',         category: 'title', price: 0,    preview: '#f0c040', description: 'You are a wizard.' },
  { id: 'title_apprentice', name: 'Apprentice',     category: 'title', price: 0,    preview: '#aaaaaa', description: 'Still learning the craft.' },
  { id: 'title_champion',   name: 'Champion',       category: 'title', price: 400,  preview: '#f0c040', description: 'Proven in battle.' },
  { id: 'title_archmage',   name: 'Archmage',       category: 'title', price: 600,  preview: '#9b30e8', description: 'Master of all spells.' },
  { id: 'title_phantom',    name: 'Phantom',        category: 'title', price: 600,  preview: '#aaddff', description: 'A ghost in the arena.' },
  { id: 'title_stormcaller',name: 'Stormcaller',    category: 'title', price: 800,  preview: '#ffee00', description: 'Lightning answers your call.' },
  { id: 'title_legend',     name: 'Legend',         category: 'title', price: 1000, preview: '#ff8800', description: 'Songs are sung of you.' },
];

module.exports = SHOP_ITEMS;
