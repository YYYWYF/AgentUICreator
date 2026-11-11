"""Offline texture bake; never imported by Creator or a generated frontend."""
from pathlib import Path
import numpy as np
import cv2
from PIL import Image
root=Path(__file__).resolve().parent
front=np.asarray(Image.open(root/'appearance.jpg').convert('RGB'))
rear=np.asarray(Image.open(root/'rear-appearance.jpg').convert('RGB'))
h,w=front.shape[:2]
u,v=np.meshgrid(np.linspace(0,1,w),np.linspace(0,1,h))
inside=((u-.5)/.29)**2+((v-.61)/.305)**2<1
_,labels=cv2.distanceTransformWithLabels((~inside).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
lookup=np.zeros((labels.max()+1,3));lookup[labels[inside]]=front[inside]
front=np.where(inside[:,:,None],front,lookup[labels]).astype(float);rear=rear.astype(float)
phi=u*2*np.pi;theta=v*np.pi
signed=lambda a:np.sign(a)*np.abs(a)**.8
x=signed(-np.cos(phi)*np.sin(theta))*1.2;y=signed(np.cos(theta))*1.08;z=signed(np.sin(phi)*np.sin(theta))*.98
sample=lambda a,uu,vv:a[np.clip((vv*(h-1)).astype(int),0,h-1),np.clip((uu*(w-1)).astype(int),0,w-1)]
a=sample(front,.5+x*.25,.56-(y-.14)*.278);b=sample(rear,.5-x/2.4,.5-y/2.16)
t=np.clip((z+.4)/.8,0,1);t=t*t*(3-2*t)
Image.fromarray(np.uint8(np.clip(a*t[:,:,None]+b*(1-t[:,:,None]),0,255))).save(root/'body-atlas.jpg',quality=96)
