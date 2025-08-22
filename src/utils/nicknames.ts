const adjectives = [
  'Gamer','Curioso','Cinéfilo','Viajante','Criativo','Focado','Geek','Nerd',
  'Ativo','Zen','Explorador','Simpático','Risonho','Astuto','Sonhador','Sábio',
  'Cósmico','Notívago','Matinal','Audaz','Tranquilo','Corajoso','Lógico','Artista'
];
const animals = [
  'Lobo','Raposa','Falcão','Pantera','Panda','Tigre','Leão','Corvo','Lontra',
  'Golfinho','Fénix','Coiote','Águia','Urso','Chita','Texugo','Canguru','Tartaruga'
];

export function randomNickname() {
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const b = animals[Math.floor(Math.random() * animals.length)];
  const n = Math.floor(10 + Math.random() * 90);
  return `${a}${b}${n}`;
}

export function avatarFromNickname(nick: string) {
  // avatar gerado por seed (podes trocar o estilo se quiseres)
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nick)}`;
}
