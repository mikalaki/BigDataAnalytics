const emptyLine = /^\s*$/;
const oneLineComment = /\/\/.*/;
const oneLineMultiLineComment = /\/\*.*?\*\//; 
const openMultiLineComment = /\/\*+[^\*\/]*$/;
const closeMultiLineComment = /^[\*\/]*\*+\//;

const SourceLine = require('./SourceLine');
const FileStorage = require('./FileStorage');
const Clone = require('./Clone');

const DEFAULT_CHUNKSIZE=5;

class CloneDetector {
    #myChunkSize = process.env.CHUNKSIZE || DEFAULT_CHUNKSIZE;
    #myFileStore = FileStorage.getInstance();

    constructor() {
    }

    // Private Methods
    // --------------------
    #filterLines(file) {
        let lines = file.contents.split('\n');
        let inMultiLineComment = false;
        file.lines=[];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            if ( inMultiLineComment ) {
                if ( -1 != line.search(closeMultiLineComment) ) {
                    line = line.replace(closeMultiLineComment, '');
                    inMultiLineComment = false;
                } else {
                    line = '';
                }
            }

            line = line.replace(emptyLine, '');
            line = line.replace(oneLineComment, '');
            line = line.replace(oneLineMultiLineComment, '');
            
            if ( -1 != line.search(openMultiLineComment) ) {
                line = line.replace(openMultiLineComment, '');
                inMultiLineComment = true;
            }

            file.lines.push( new SourceLine(i+1, line.trim()) );
        }
       
        return file;
    }

    #getContentLines(file) {
        return file.lines.filter( line => line.hasContent() );        
    }


    #chunkify(file) {
        let chunkSize = this.#myChunkSize;
        let lines = this.#getContentLines(file);
        file.chunks=[];

        for (let i = 0; i <= lines.length-chunkSize; i++) {
            let chunk = lines.slice(i, i+chunkSize);
            file.chunks.push(chunk);
        }
        return file;
    }
    
    #chunkMatch(first, second) {
        let match = true;

        if (first.length != second.length) { match = false; }
        for (let idx=0; idx < first.length; idx++) {
            if (!first[idx].equals(second[idx])) { match = false; }
        }

        return match;
    }

    #filterCloneCandidates(file, compareFile) {
        let newInstances = [];

        // Compare each chunk with all chunks in the stored file.
        for (let chunk of file.chunks) {
            for (let j = 0; j < compareFile.chunks.length; j++) {
                let targetChunk = compareFile.chunks[j];
                if (this.#chunkMatch(chunk, targetChunk)) {
                    let clone = new Clone(file.name, compareFile.name, chunk, targetChunk);

                    // Keep the target position for checking continuity during expansion.
                    clone.targetChunkIndex = j;
                    newInstances.push(clone);
                }
            }
        }

        file.instances = file.instances || [];        
        file.instances = file.instances.concat(newInstances);
        return file;
    }
     
    #expandCloneCandidates(file) {
        let expanded = [];

        for (let clone of file.instances) {
            // Both source and target windows must advance together.
            // maybeExpandWith checks the source and expands it when possible.
            let existing = expanded.find(candidate =>
                candidate.targets[0].name === clone.targets[0].name &&
                candidate.targetChunkIndex + 1 === clone.targetChunkIndex &&
                candidate.maybeExpandWith(clone)
            );

            if (existing) {
                existing.targetChunkIndex = clone.targetChunkIndex;
            } else {
                expanded.push(clone);
            }
        }

        file.instances = expanded;
        return file;
    }
    
    #consolidateClones(file) {
        let consolidated = [];

        for (let clone of file.instances) {
            // Group matches with the same source file and line range.
            let existing = consolidated.find(candidate => candidate.equals(clone));
            if (existing) {
                existing.addTarget(clone);
            } else {
                consolidated.push(clone);
            }
        }

        file.instances = consolidated;
        return file;
    }
    

    // Public Processing Steps
    // --------------------
    preprocess(file) {
        return new Promise( (resolve, reject) => {
            if (!file.name.endsWith('.java') ) {
                reject(file.name + ' is not a java file. Discarding.');
            } else if(this.#myFileStore.isFileProcessed(file.name)) {
                reject(file.name + ' has already been processed.');
            } else {
                resolve(file);
            }
        });
    }

    transform(file) {
        file = this.#filterLines(file);
        file = this.#chunkify(file);
        return file;
    }

    matchDetect(file) {
        let allFiles = this.#myFileStore.getAllFiles();
        file.instances = file.instances || [];
        for (let f of allFiles) {
            file = this.#filterCloneCandidates(file, f); 
        }

        // Expand individual matches before grouping their targets.
        file = this.#expandCloneCandidates(file);
        file = this.#consolidateClones(file); 

        return file;
    }

    pruneFile(file) {
        delete file.lines;
        delete file.instances;
        return file;
    }
    
    storeFile(file) {
        this.#myFileStore.storeFile(this.pruneFile(file));
        return file;
    }

    get numberOfProcessedFiles() { return this.#myFileStore.numberOfFiles; }
}

module.exports = CloneDetector;