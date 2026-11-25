import photo from './media/water.webp'
import section from './media/water-section.svg'
import { p, h, link, text, mark } from '../document-nodes.js'
import { image, video, caption, credit, file } from './figures.js'

export function water() {
  return {title:'Ancient water wisdom, from village tanks to qanats',files:new Map([
    file('reservoir','parakrama-samudra.webp','image/webp',photo),
    file('section','two-paths-for-water.svg','image/svg+xml',section),
  ]),doc:{type:'doc',content:[
    p('Stand at the edge of a full reservoir and the hard part looks finished. Now imagine deciding, before the monsoon ends, how much water to release to the next village and how much to keep for a dry month. The engineering lies as much in the connections as in the wall holding back the water.'),
    image('reservoir','Evening panorama of Parakrama Samudra reservoir at Polonnaruwa, Sri Lanka',660),
    caption('Parakrama Samudra at Polonnaruwa. This large reservoir gives a sense of the scale of Sri Lanka’s irrigation heritage. The village cascade below works across a much smaller catchment.'),
    credit('Vethish','https://commons.wikimedia.org/wiki/File:Parakrama_samudra.jpg','CC BY-SA 3.0','https://creativecommons.org/licenses/by-sa/3.0/'),
    h(2,'Follow a raindrop through Sri Lanka’s dry zone'),
    p('Rain runs off the higher ground into a small reservoir, often called a tank or wewa. The embankment holds water back. A sluice lets people release water to the fields. A spillway gives excess water a route onward when the tank fills. A series of tanks at successively lower elevations can use the same valley through the wet and dry seasons.'),
    p('How land is used upstream matters downstream. A wooded catchment and vegetation around a tank can slow runoff and intercept sediment. If too much soil enters the basin it takes up space once available for water. FAO describes these linked village systems as having evolved over nearly two millennia. ',link('FAO’s Sri Lankan tank-village profile','https://www.fao.org/giahs/around-the-world/detail/sri-lanka-dry-zone/en'),'.'),
    image('section','Cross-sections comparing two surface tanks linked by a spillway with an underground qanat tunnel'),
    h(2,'Follow groundwater through an Iranian qanat'),
    p('On a dry alluvial slope, a well reaches the water table uphill. A gently descending tunnel carries groundwater to an outlet lower down. The line of vertical shafts visible at the surface gives workers access to dig, clear debris and repair the tunnel. Gravity supplies the flow, and the underground journey limits evaporation.'),
    p('One system stores a pulse of rain at the surface. The other conveys groundwater to daylight. Both need people to maintain the route and agree who gets water when supplies fall. UNESCO records arrangements for sharing water among the communities served by the Persian qanats. ',link('UNESCO’s Persian Qanat record','https://whc.unesco.org/en/list/1506/'),'.'),
    h(2,'A field question'),
    p(text('If an upstream tank silts up, who notices first? ',mark('bold')),'Walk the diagram downstream. A smaller basin fills and spills sooner in a storm, then stores less for a dry spell. How those changes affect a particular farm depends on where its intake is and how the releases are managed.'),
    video('Wh-wemqL9aY','The Climate and Us · The Ancient Invention Critical to Daily Life'),
    p('Watch how the landscape looks from above in ',link('the film featured by FAO','https://www.fao.org/biodiversity/resources/video/detail/sri-lanka-s-tank-cascade-system--the-ancient-invention-critical-to-daily-life/en'),'. Look for the narrow land between an expanse of water and the fields it serves.'),
  ]}}
}
