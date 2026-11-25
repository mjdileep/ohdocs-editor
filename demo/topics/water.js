import photo from './media/water.webp'
import section from './media/water-section.svg'
import { p, h, link, text, mark } from '../document-nodes.js'
import { image, video, caption, credit, file } from './figures.js'

export function water() {
  return {title:'How Sri Lanka’s tank villages shared the monsoon',files:new Map([
    file('reservoir','parakrama-samudra.webp','image/webp',photo),
    file('section','sri-lankan-tank-cascade.svg','image/svg+xml',section),
  ]),doc:{type:'doc',content:[
    p('When a village reservoir fills in Sri Lanka’s dry zone, the water that spills over can become the next village’s reserve. Farmers built small earth embankments at intervals down shallow valleys. Together the reservoirs could hold part of a monsoon’s rain long enough to grow rice in the dry months.'),
    p('Known as ',text('ellanga gammana',mark('italic')),', these linked tank villages developed over nearly two thousand years. In 2017 the UN Food and Agriculture Organization (FAO) designated Sri Lanka’s dry-zone system a Globally Important Agricultural Heritage System. ',link('FAO’s heritage record','https://www.fao.org/giahs/around-the-world/detail/sri-lanka-dry-zone/en'),'.'),
    h(2,'Where does the water go?'),
    image('section','Two reservoirs at different elevations. Overflow from the upper tank feeds the lower tank, whose sluice releases water to rice fields.'),
    caption('Read from left to right, downhill. A spillway carries surplus water when a tank fills. Farmers can open a separate outlet, the sluice, to irrigate fields below the embankment.'),
    p('Palugaswewa, in Anuradhapura District, gives a sense of the scale. The 2017 heritage proposal counted 78 tanks in 12 cascades there. Forest and scrub covered the higher ground, with farms and settlements lower down. The boundary that mattered for water was the whole valley. ',link('Palugaswewa designation proposal','https://www.fao.org/giahs/around-the-world/detail/sri-lanka-dry-zone/en'),'.'),
    h(2,'Who gets to plant after a weak monsoon?'),
    p('Picture two rice farmers. One has a plot beside the tank. The other farms at the far end of the channel, beyond the reach of the remaining water. Under a practice called ',text('bethma',mark('italic')),', cultivators can agree to plant a smaller area near the tank that season. The farmer at the far end gets a share of the irrigable land. The arrangement lasts for the season and depends on the farmers reaching agreement. ',link('How bethma works','https://www.geo.fu-berlin.de/en/v/tanks-in-the-dryzone-of-sri-lanka/exploring-tank-systems/traditional-knowledge/bethma-system/index.html'),'.'),
    h(2,'See the landscape'),
    video('Wh-wemqL9aY','The Climate and Us · Sri Lanka’s tank cascade system'),
    p('In the aerial footage, look for the curve of an embankment and the patchwork of rice fields immediately below it. Then look downhill for the next stretch of open water. ',link('Watch the film featured by FAO','https://www.fao.org/biodiversity/resources/video/detail/sri-lanka-s-tank-cascade-system--the-ancient-invention-critical-to-daily-life/en'),'.'),
    image('reservoir','Evening panorama of Parakrama Samudra reservoir at Polonnaruwa, Sri Lanka',660),
    caption('Parakrama Samudra at Polonnaruwa shows a different scale of Sri Lankan irrigation. This is one large reservoir. The diagram above shows how a village cascade links several small ones.'),
    credit('Vethish','https://commons.wikimedia.org/wiki/File:Parakrama_samudra.jpg','CC BY-SA 3.0','https://creativecommons.org/licenses/by-sa/3.0/'),
  ]}}
}
