import { createEnglishSpelling } from './spelling-engine.js';
import usAff from '../node_modules/dictionary-en/index.aff';
import usDic from '../node_modules/dictionary-en/index.dic';
import gbAff from '../node_modules/dictionary-en-gb/index.aff';
import gbDic from '../node_modules/dictionary-en-gb/index.dic';

const check = createEnglishSpelling([{ aff:usAff, dic:usDic }, { aff:gbAff, dic:gbDic }]);
self.onmessage = ({ data }) => {
  try { self.postMessage({ id:data.id, result:check(data.word) }); }
  catch { self.postMessage({ id:data.id, error:true }); }
};
