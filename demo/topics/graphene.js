import photo from './media/graphite.webp'
import lattice from './media/graphite-layers.svg'
import { p, h, link } from '../document-nodes.js'
import { image, video, credit, caption, table, file } from './figures.js'

export function graphene() {
  return {title:'Why can graphene be so expensive?',files:new Map([
    file('graphite','sri-lankan-graphite.webp','image/webp',photo),
    file('layers','graphite-to-graphene.svg','image/svg+xml',lattice),
  ]),doc:{type:'doc',content:[
    p('A pencil can leave graphite on paper for a fraction of a cent. A lab may pay a premium for a single, continuous sheet of carbon on a chip. Both purchases start with the same element. Only the second comes with a promise about exactly where the atoms ended up.'),
    image('layers','Diagram of a stack of graphite layers and a single graphene sheet'),
    h(2,'Where does it come from?'),
    p('Graphite is mined. Graphene is usually made. One route separates the layers of graphite into flakes. Another grows carbon on a surface from a gas. In that second route the carbon need never pass through a graphite mine.'),
    p('China supplied an estimated 82% of world natural graphite mine production in 2025, about 1.4 million metric tons. Those figures track a raw material. They cannot tell us which country made the most finished graphene films. ',link('USGS, Mineral Commodity Summaries 2026','https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-graphite.pdf'),'.'),
    h(2,'What does “purest” mean?'),
    image('graphite','A roughly nine-centimetre specimen of Sri Lankan vein graphite',410),
    caption('Sri Lankan vein graphite. The photograph shows a hand specimen. An individual graphene layer is one atom thick.'),
    credit('Darla Sondrol, GeoDIL specimen 913','https://commons.wikimedia.org/wiki/File:Graphite_(GeoDIL_number_-_913).jpg','CC0','https://creativecommons.org/publicdomain/zero/1.0/'),
    p('Sri Lanka is known for high-grade vein graphite. Its Industrial Technology Institute reports a purification process reaching 99.99% carbon. That figure measures graphite after processing. A finished sheet can be chemically very pure and still have a tear, overlapping layers or grain boundaries. There is no meaningful “purest graphene country” without specifying a property, a specimen and a measurement. ',link('ITI’s purification report','https://www.iti.lk/wp-content/uploads/2024/05/graphite-purification-for-4-nines.pdf'),'.'),
    h(2,'What the buyer pays for'),
    table(['Product','What the buyer needs','Where the cost arises'],['Flakes for a mixture','Enough material in a useful size range','Separation, sorting and yield'],['A lab flake','A clean monolayer at a known spot','Finding it and measuring its thickness'],['A film for a device','Continuous coverage on the right substrate','Growth, transfer and inspection for damage']),
    p('In a 2009 experiment, Li and colleagues grew centimetre-scale graphene on copper from methane, then transferred the films to other substrates. Imagine two films of equal area. A tear may cost little if the film is going into a mixture, but it can interrupt the only conducting path in a device. That is why a price per gram tells you little about a price per usable chip. ',link('The copper-film experiment','https://pubmed.ncbi.nlm.nih.gov/19423775/'),'.'),
    video('0fbQX5VJmew','University of Manchester · What is graphene?'),
    p('Compare ',link('Manchester’s account of mechanical exfoliation','https://www.graphene.manchester.ac.uk/about/history/index.htm'),' with ',link('the National Physical Laboratory guide to measuring layer count, disorder and flake size','https://www.npl.co.uk/resources/gpgs/graphene-structure-characterisation'),'. Which measurement would you ask for before paying for a monolayer?'),
  ]}}
}
