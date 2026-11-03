// Clip a swept player circle at visible booth furniture. The campus collision
// controller still handles ground/walls and is applied to the clipped motion.
export function clipDistrictMotion(from,motion,obstacles=[],radius=0) {
  const length2=motion.x*motion.x+motion.z*motion.z;if(length2<1e-16)return {...motion};
  let fraction=1;
  for(const obstacle of obstacles){
    const reach=radius+obstacle.radius,dx=from.x-obstacle.x,dz=from.z-obstacle.z;
    const c=dx*dx+dz*dz-reach*reach,b=2*(dx*motion.x+dz*motion.z);
    if(c<0){if(b<0)fraction=0;continue;}
    const discriminant=b*b-4*length2*c;if(discriminant<=0)continue;
    const hit=(-b-Math.sqrt(discriminant))/(2*length2);
    if(hit>=0&&hit<=fraction)fraction=Math.max(0,hit-.001/Math.sqrt(length2));
  }
  return {x:motion.x*fraction,z:motion.z*fraction};
}
