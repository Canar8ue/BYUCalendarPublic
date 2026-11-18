// Board IDs retain the wardrobe's existing deck save field and reward unlocks.
// Performance factors multiply ordinary pushing, cruising and ollie lift.
export const SKATE_BOARDS = Object.freeze([
  {id:'classic', name:'Campus blue', level:1, color:'#275b9c', accent:'#9dd9dc', ink:'#f8eddb', grip:'#25313a', wheel:'#f4e8c9', graphic:'stripe', acceleration:1, topSpeed:1, pop:1, description:'An even balance for learning lines.'},
  {id:'cherry', name:'Cherry checker', level:1, color:'#b54550', accent:'#f6dfb6', ink:'#223b49', grip:'#312c3a', wheel:'#f4d6b1', graphic:'checker', acceleration:1.18, topSpeed:.94, pop:1, description:'Quick starts with a calmer cruising pace.'},
  {id:'bloom', name:'Wildflower', level:1, color:'#e9a7bc', accent:'#fff0bc', ink:'#46715e', grip:'#393142', wheel:'#fff0bc', graphic:'bloom', acceleration:.96, topSpeed:.92, pop:1.15, description:'Extra ollie lift for gaps and playful lines.'},
  {id:'bolt', name:'Night voltage', level:1, color:'#192b40', accent:'#f0a14d', ink:'#9dded7', grip:'#222b32', wheel:'#f0a14d', graphic:'bolt', acceleration:.90, topSpeed:1.18, pop:.94, description:'A fast cruiser that takes longer to wind up.'},
  {id:'aurora', name:'Aurora drift', level:1, color:'#446b88', accent:'#b6a4de', ink:'#8fe0cb', grip:'#26333e', wheel:'#b6a4de', graphic:'wave', acceleration:.94, topSpeed:1.10, pop:1.08, description:'Long rolling lines with a little extra lift.'},
  {id:'orbit', name:'Orbit club', level:1, color:'#634b89', accent:'#ecd172', ink:'#c3dce5', grip:'#302e42', wheel:'#ecd172', graphic:'orbit', acceleration:1.04, topSpeed:1.06, pop:.96, description:'Smooth pace for linking campus corners.'},
  {id:'citrus', name:'Citrus slice', level:1, color:'#e5a140', accent:'#f6edb1', ink:'#3b775e', grip:'#2f3934', wheel:'#f6edb1', graphic:'sun', acceleration:1.12, topSpeed:.97, pop:1.05, description:'Lively pushes and a springy pop.'},
  {id:'sea', name:'Sea glass', level:2, color:'#377e78', accent:'#b8e1cb', ink:'#e7e8c7', grip:'#25383a', wheel:'#b8e1cb', graphic:'wave', acceleration:1.08, topSpeed:1.02, pop:.98, description:'An easy-rolling board with brisk starts.'},
  {id:'gold', name:'Golden ticket', level:4, color:'#bd862e', accent:'#f6e5a9', ink:'#6b4f7c', grip:'#39322f', wheel:'#f6e5a9', graphic:'sun', acceleration:.97, topSpeed:1.10, pop:1.04, description:'Golden rays and a longer cruising stride.'},
  {id:'cosmo', name:'Cougar spirit', quest:'cosmo', color:'#f2eee0', accent:'#4a7fba', ink:'#1c3f65', grip:'#24364c', wheel:'#f2eee0', graphic:'paw', acceleration:1.08, topSpeed:.97, pop:1.10, description:'Claw-mark grip and a confident pop.'},
  {id:'comet', name:'Comet', gold:3, color:'#ebba51', accent:'#e6eece', ink:'#4e4a88', grip:'#2a3040', wheel:'#ebba51', graphic:'comet', acceleration:.96, topSpeed:1.15, pop:1.02, description:'A star-trail graphic built for fast lines.'},
  {id:'workshop', name:'Nora’s workshop', activity:'scooter-school', color:'#65b8aa', accent:'#f1d0a0', ink:'#31565d', grip:'#2e3d3b', wheel:'#f1d0a0', graphic:'checker', acceleration:1.16, topSpeed:.95, pop:1.03, description:'Hand-built character and eager acceleration.'},
].map(board => Object.freeze(board)));

export function resolveSkateBoard(id) {
  return SKATE_BOARDS.find(board => board.id === id) || SKATE_BOARDS[0];
}
