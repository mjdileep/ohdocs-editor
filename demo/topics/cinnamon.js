import photo from './media/cinnamon.webp'
import { p, h, text, mark, link } from '../document-nodes.js'
import { image, video, caption, credit, table, file } from './figures.js'

const bfr = 'https://www.bfr.bund.de/en/service/frequently-asked-questions/topic/faq-on-coumarin-in-cinnamon-and-other-foods/'
const nccih = 'https://www.nccih.nih.gov/health/cinnamon/'

export function cinnamon() {
  return {title:'Ceylon or cassia? A closer look at cinnamon', files:new Map([
    file('quills','cinnamon-quills.webp','image/webp',photo),
  ]), doc:{type:'doc',content:[
    p('Turn a cinnamon stick on its end. One quill looks like a little cigar packed with paper-thin curls. Beside it, a much thicker piece of bark rolls around an open centre. These two spices can share a supermarket label and still differ in a way that matters if you use cinnamon every day.'),
    image('quills','Ceylon cinnamon quills on the left and Indonesian cassia on the right',430),
    caption('Left, Ceylon cinnamon. Right, Indonesian cassia. Look at the cut ends to see how the bark folds.'),
    credit('Antti Vähä-Sipilä','https://commons.wikimedia.org/wiki/File:Cinnamomum_verum_vs_Cinnamomum_burmanni.jpg','CC BY-SA 1.0 Finland','https://creativecommons.org/licenses/by-sa/1.0/fi/'),
    h(2,'What changes in the jar?'),
    table(['What to compare','Ceylon cinnamon','Cassia types'],['Label','Cinnamomum verum, also called C. zeylanicum','Includes Chinese and Indonesian cassia'],['Whole bark','Many fine layers in a quill','Often one thick curl or two inward rolls'],['Coumarin','Usually very little','Generally much more, with variation between lots']),
    p('Coumarin occurs naturally in the bark. Repeated high exposure can affect the liver in susceptible people. An occasional sprinkle of cassia and a large spoonful taken every morning are different patterns of exposure. For frequent, generous use, the German Federal Institute for Risk Assessment recommends choosing Ceylon cinnamon. ',link('Read the BfR guidance',bfr),'.'),
    h(2,'How much difference can the batch make?'),
    p('BfR gives a tolerable daily intake of 0.1 mg of coumarin per kilogram of body weight. Its example of a 60 kg adult works out to 6 mg of coumarin. Around 2 g of cassia at the average concentration in its example would supply that amount. That benchmark describes long-term exposure. The amount in a spoonful depends on the batch.'),
    h(2,'From bark to quill in Sri Lanka'),
    p('Watch how a worker loosens the inner bark and assembles a quill. Then look back at the layers in the photograph. The film follows the craft and its cost.'),
    video('OhO5fKkHTH8','Business Insider · How the World’s Most Expensive Cinnamon Is Produced'),
    p('Watch on ',link('YouTube','https://youtu.be/OhO5fKkHTH8'),'.'),
    h(2,'A practical choice'),
    p('For ground cinnamon, look for the species on the packet. Grinding removes the visual clues. If you are considering capsules for blood sugar, the evidence for a health benefit is unclear, and supplements can deliver a different dose from seasoning food. ',link('NCCIH’s evidence and safety summary',nccih),'.'),
    p(text('Try it in your kitchen. ',mark('bold')),'What species, country of origin and amount does your own packet actually specify?'),
  ]}}
}
