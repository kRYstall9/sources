function decodeHiddenUrl(encodedString) {
    // Step 1: Base64 decode the initial string
    let step1 = atob(encodedString);
    
    // Step 2: Swap character cases and reverse
    let step2 = step1.split('').map(c => 
        /[a-zA-Z]/.test(c) ? (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()) : c
    ).join('');
    let step3 = step2.split('').reverse().join('');
    
    // Step 3: Base64 decode again and reverse
    let step4 = atob(step3);
    let step5 = step4.split('').reverse().join('');
    
    // Step 4: Hex decode pairs
    let step6 = '';
    for(let i = 0; i < step5.length; i += 2) {
        step6 += String.fromCharCode(parseInt(step5.substr(i, 2), 16));
    }
    
    // Step 5: Subtract 3 from character codes
    let step7 = step6.split('').map(c => 
        String.fromCharCode(c.charCodeAt(0) - 3)
    ).join('');
    
    // Step 6: Final case swap, reverse, and Base64 decode
    let step8 = step7.split('').map(c => 
        /[a-zA-Z]/.test(c) ? (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()) : c
    ).join('');
    let step9 = step8.split('').reverse().join('');
    
    return atob(step9);
}

// Usage with the encoded string from the original code
const encodedStr = "PT1hbldxZG0ycVpuV3V0eTNHWm4zQ2RtWm1NbjBtSm4weXRuV0NaeTJDWm5YcVp5MnFnbktEWnkxZTJuSnZkbTNhWm0zQ1p5MmUyblhtZG5abWRuS0RkejFhSm4weVpuM2FabTN5ZG4zQ1puV21aeTNHdG5XeWR6MWkybjBxZHozZVptWnlaeTBxMm5XbXRuM3F0bktEdG0xaTJtWnlabjBDdG5XbUp5WnVabjB1dHkybWduTUR0bzFhSm5LenRvMHVKbjR1Wm4zR2RuMXVkejJtZ25MREpuM2V3bjN5ZG8wcWRuTXJabjFxMm41eVpuM0tkbktESm4yR1puWHlabjNDWm5LRHRtM2VNbk12dG8xbVpuSURKbjFDWm40cUp6MHl0bll5dG8zQ2RuM3VabjB5Mm0yQ0puMWVNbjRDdG8zbXRuNEN0b1p1ZG4wdXRvM3VabTJDWm1adVpuMHFkejNtd25Kelp5MmUybld1ZG0ycU1uM0NKbTFhWm4xQ1puM2V0bjVDZG1aeWRuMnFKejNlWm0xQ1p5MGkybUpEdG8zcXduSm5aeTJlZ24zdWR6Wm1NbjJxWm4weTJtNHVkbTJ5d25LRHRvMmVnbjF1Wm0zcU1uSERkejB5Mm41eXR5MHl0bktuZG8zeVpuV210bjN1Sm4zQ0ptWktKbjV5SnkwQ3RuM0NkbzJlZ24wcWR6MktabTFDWnkxR1puSnpabjNhdG5IemRuMkNkbjN1ZG8zcUpuM0NkejFDWm1Kdlp5MnkybTVDZG0yaWduMm1abTN1Sm5JcmRu";

console.log("Decoded URL:", decodeHiddenUrl(encodedStr));