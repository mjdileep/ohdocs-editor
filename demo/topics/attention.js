import heatmap from './media/attention-weights.svg'
import program from './media/attention.py'
import { p, h, link, object, code, text, mark } from '../document-nodes.js'
import { image, video, caption, table, file } from './figures.js'

export function attention() {
  return {title:'How a language model pays attention',files:new Map([
    file('weights','attention-weights.svg','image/svg+xml',heatmap),
    file('program','attention.py','text/x-python',program),
  ]),doc:{type:'doc',content:[
    p('Read “the river bank” and then “the central bank.” The final word has the same spelling. What changes is which earlier words help you interpret it. A transformer has a way to mix information from other positions into the representation of the current token. That operation is called attention.'),
    h(2,'What happens before the next word appears?'),
    p('A language model splits text into tokens, which may be words or pieces of words. It represents them as vectors and uses position information so word order matters. In a decoder-only transformer, layers of masked self-attention and feed-forward networks repeatedly update those vectors. The final representation at the last position produces scores for possible next tokens. The model can select or sample one, append it and repeat. During training, predicting known next tokens gives it a way to adjust its parameters.'),
    h(2,'Work through a single head'),
    p('Each token representation is projected into a query, a key and a value. At “bank,” its query is compared with each visible key. The dot product produces a score. Scaling by the square root of the key dimension keeps the scores from growing simply because the vectors are long. Softmax turns those scores into positive weights that sum to one. The result is a weighted sum of the values.'),
    {type:'blockMath',attrs:{latex:String.raw`\operatorname{Attention}(Q,K,V)=\operatorname{softmax}\!\left(\frac{QK^{\mathsf T}}{\sqrt{d_k}}+M\right)V`}},
    p('Each row of the matrix belongs to one query. The causal mask M contributes zero at allowed positions and negative infinity at future positions, giving them zero weight. Multiple heads learn different projections, and their outputs are combined.'),
    image('weights','Diagram and bar chart of the query from bank weighting the, river and bank at about 9%, 67% and 24%'),
    caption('One illustrative row. The scores below are hand-picked to make the arithmetic visible. They are not measurements from a trained model.'),
    table(['Token','Scaled score','Weight','Value'],['the','0','0.090','[0, 0]'],['river','2','0.665','[1, 0]'],['bank','1','0.245','[0, 1]']),
    p('Only “river” contributes to the first component and only “bank” to the second. The mixed output is therefore about [0.665, 0.245]. It is an intermediate vector. Later layers still have to turn the information into a prediction.'),
    h(2,'Try the calculation'),
    code('python',program.trimEnd()),
    object({fileId:'program',label:'attention.py',detail:'Python · standard library'}),
    p('Run the file with ',text('python3 attention.py',mark('code')),'. Change the query to [0, 1] and run it again. The keys and values stay fixed. Which earlier token now gets the most weight?'),
    h(2,'Sketch the causal boundary'),
    object({label:'Four-step causal mask boundary',width:184,drawing:{width:184,height:98,size:3,color:'#2b7583',opacity:1,points:[[7,9],[48,9],[48,34],[90,34],[90,59],[132,59],[132,84],[176,84]]}}),
    p('Trace the staircase from the top left. Each lower row stands for one more token in the sequence. The first row can use one position, the second can use two, and the fourth can use four. Select the sketch and add a fifth step using the pen.'),
    video('eMlx5fFNoYc','3Blue1Brown · Attention in transformers, step-by-step'),
    p('Grant Sanderson animates the separate contributions of queries, keys and values in ',link('the accompanying visual lesson','https://www.3blue1brown.com/lessons/attention/'),'.'),
    h(2,'How old is the idea?'),
    p('In the Satipaṭṭhāna Sutta, the practitioner sits and recognizes a long breath as long and a short breath as short. It is an early Buddhist example of deliberately attending to an experience. These discourses circulated orally. Theravāda tradition dates the writing down of the Pāli canon in Sri Lanka to the first century BCE. The composition date of this particular discourse is uncertain. That history makes a claim about the world’s first mention of attention difficult to establish. It also supplies no evidence that machine attention descended from Buddhist practice. ',link('Read MN 10 in translation','https://suttacentral.net/mn10/en/sujato'),' · ',link('A reader’s guide to the textual history','https://suttacentral.net/general-guide-sujato?lang=en'),'.'),
    p('The computational idea has its own paper trail. In 1986, ',link('Kunihiko Fukushima','https://pubmed.ncbi.nlm.nih.gov/3801530/'),' simulated selective attention for visual pattern recognition. In 2014, ',link('Bahdanau, Cho and Bengio','https://arxiv.org/abs/1409.0473'),' trained a translation model to weight source positions for each output word. In 2017, ',link('Vaswani and colleagues','https://arxiv.org/abs/1706.03762'),' introduced the Transformer and its multi-head attention architecture. Those are documented milestones in different problems.'),
  ]}}
}
