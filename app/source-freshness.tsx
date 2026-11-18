import type {CampusEvent,SourceStatus} from './types';
import {sourceDateLabel} from '../lib/event-presentation.mjs';

export default function SourceFreshness({event,sources}:{event:CampusEvent;sources:SourceStatus[]}){
 const source=sources.find(source=>source.id===event.sourceId);
 const checked=sourceDateLabel(source?.lastSuccess),modified=sourceDateLabel(event.sourceUpdated);
 if(!checked&&!modified&&!source?.snapshot&&!source?.error)return null;
 return <p className="source-freshness">
  {source?.snapshot?<>Dated snapshot{checked?' imported '+checked:''}. This listing does not refresh automatically. </>:checked?<>Source last retrieved {checked}. </>:null}
  {modified&&<>Source listing updated {modified}. </>}
  {source?.error&&<>The latest source refresh failed; previously collected details are shown. </>}
  Check the original listing for changes.
 </p>;
}
